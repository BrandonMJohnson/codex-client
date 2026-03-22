import type { RpcRequestOptions } from "../rpc/index.js";
import type {
  ServerNotification,
  TurnStartParams,
  TurnStartResponse
} from "../protocol/index.js";

type TurnStreamEventMethod =
  | "turn/started"
  | "item/started"
  | "item/agentMessage/delta"
  | "item/completed"
  | "turn/completed";

export type AppServerClientTurnStreamEvent = Extract<
  ServerNotification,
  { method: TurnStreamEventMethod }
>;

export type AppServerClientTurnStreamEventMethod =
  AppServerClientTurnStreamEvent["method"];

export type AppServerClientTurnStreamEventOf<
  Method extends AppServerClientTurnStreamEventMethod
> = Extract<AppServerClientTurnStreamEvent, { method: Method }>;

export type AppServerClientTurnRunCompletedItem =
  AppServerClientTurnStreamEventOf<"item/completed">["params"]["item"];

export interface AppServerClientTurnRunOptions {
  /**
   * Request options forwarded to the underlying `turn/start` RPC call.
   */
  readonly request?: RpcRequestOptions;
  /**
   * Optional wall-clock timeout for waiting on the terminal `turn/completed`
   * notification after `turn/start` succeeds.
   */
  readonly completionTimeoutMs?: number;
  /**
   * Optional abort signal for the whole helper. When `request.signal` is not
   * provided, the same signal also aborts the initial `turn/start` request.
   */
  readonly signal?: AbortSignal;
  /**
   * Invoked for each collected turn-stream event in arrival order.
   */
  readonly onEvent?: (event: AppServerClientTurnStreamEvent) => void;
}

export interface AppServerClientTurnRunResult {
  /**
   * Immediate `turn/start` response returned by app-server.
   */
  readonly start: TurnStartResponse;
  /**
   * Matching `turn/started` notification when the connection has not opted out
   * of that method.
   */
  readonly started: AppServerClientTurnStreamEventOf<"turn/started"> | null;
  /**
   * Terminal `turn/completed` notification for the started turn.
   */
  readonly completed: AppServerClientTurnStreamEventOf<"turn/completed">;
  /**
   * All collected lifecycle notifications for the turn in arrival order.
   */
  readonly events: readonly AppServerClientTurnStreamEvent[];
  /**
   * Completed items in the order their `item/completed` notifications arrived.
   */
  readonly completedItems: readonly AppServerClientTurnRunCompletedItem[];
  /**
   * Reconstructed `item/agentMessage/delta` text keyed by item id.
   */
  readonly agentMessageDeltas: Readonly<Record<string, string>>;
}

export interface TurnRunEventSource {
  readonly turn: {
    start(
      params: TurnStartParams,
      options?: RpcRequestOptions
    ): Promise<TurnStartResponse>;
  };
  onEvent<Method extends AppServerClientTurnStreamEventMethod>(
    method: Method,
    listener: (notification: AppServerClientTurnStreamEventOf<Method>) => void
  ): () => void;
}

export async function runTurnWithStream(
  source: TurnRunEventSource,
  params: TurnStartParams,
  options: AppServerClientTurnRunOptions = {}
): Promise<AppServerClientTurnRunResult> {
  if (options.signal?.aborted) {
    throw createAbortError(options.signal.reason);
  }

  const collector = new TurnStreamCollector(
    source,
    params.threadId,
    options.onEvent
  );

  try {
    const start = await source.turn.start(params, mergeRequestOptions(options));
    collector.setTurnId(start.turn.id);
    return await collector.waitForCompletion(
      start,
      options.completionTimeoutMs,
      options.signal
    );
  } finally {
    collector.dispose();
  }
}

class TurnStreamCollector {
  readonly #bufferedThreadEvents: AppServerClientTurnStreamEvent[] = [];
  readonly #completedItems: AppServerClientTurnRunCompletedItem[] = [];
  readonly #events: AppServerClientTurnStreamEvent[] = [];
  readonly #agentMessageDeltas: Record<string, string> = {};
  readonly #threadId: string;
  readonly #unsubscribeCallbacks: Array<() => void>;
  readonly #onEvent: ((event: AppServerClientTurnStreamEvent) => void) | undefined;

  #completed: AppServerClientTurnStreamEventOf<"turn/completed"> | undefined;
  #rejectCompletion:
    | ((reason?: unknown) => void)
    | undefined;
  #resolveCompletion:
    | ((value: AppServerClientTurnRunResult) => void)
    | undefined;
  #start: TurnStartResponse | undefined;
  #started: AppServerClientTurnStreamEventOf<"turn/started"> | null = null;
  #turnId: string | undefined;

  public constructor(
    source: TurnRunEventSource,
    threadId: string,
    onEvent: ((event: AppServerClientTurnStreamEvent) => void) | undefined
  ) {
    this.#threadId = threadId;
    this.#onEvent = onEvent;
    this.#unsubscribeCallbacks = [
      source.onEvent("turn/started", (notification) => {
        this.#accept(notification);
      }),
      source.onEvent("item/started", (notification) => {
        this.#accept(notification);
      }),
      source.onEvent("item/agentMessage/delta", (notification) => {
        this.#accept(notification);
      }),
      source.onEvent("item/completed", (notification) => {
        this.#accept(notification);
      }),
      source.onEvent("turn/completed", (notification) => {
        this.#accept(notification);
      })
    ];
  }

  public dispose(): void {
    for (const unsubscribe of this.#unsubscribeCallbacks) {
      unsubscribe();
    }
  }

  public setTurnId(turnId: string): void {
    this.#turnId = turnId;

    if (this.#bufferedThreadEvents.length === 0) {
      return;
    }

    // A fast turn can emit notifications before the `turn/start` response
    // resolves. Buffer thread-scoped events first, then replay only the ones
    // that belong to the started turn once the server tells us its id.
    for (const event of this.#bufferedThreadEvents) {
      if (getTurnId(event) !== turnId) {
        continue;
      }

      this.#recordEvent(event);
    }

    this.#bufferedThreadEvents.length = 0;
  }

  public async waitForCompletion(
    start: TurnStartResponse,
    completionTimeoutMs: number | undefined,
    signal: AbortSignal | undefined
  ): Promise<AppServerClientTurnRunResult> {
    this.#start = start;

    if (this.#completed) {
      return this.#createResult(start);
    }

    const normalizedTimeoutMs = normalizeTimeoutMs(completionTimeoutMs);
    if (signal?.aborted) {
      throw createAbortError(signal.reason);
    }

    return await new Promise<AppServerClientTurnRunResult>((resolve, reject) => {
      const disposers: Array<() => void> = [];
      const settle = (
        callback: (value: AppServerClientTurnRunResult | Error) => void,
        value: AppServerClientTurnRunResult | Error
      ): void => {
        for (const dispose of disposers) {
          dispose();
        }

        this.#resolveCompletion = undefined;
        this.#rejectCompletion = undefined;
        callback(value);
      };

      this.#resolveCompletion = (value) => {
        settle((resolvedValue) => {
          resolve(resolvedValue as AppServerClientTurnRunResult);
        }, value);
      };
      this.#rejectCompletion = (error) => {
        settle((rejectedValue) => {
          reject(rejectedValue as Error);
        }, asError(error));
      };

      if (signal) {
        const abort = (): void => {
          this.#rejectCompletion?.(createAbortError(signal.reason));
        };

        signal.addEventListener("abort", abort, { once: true });
        disposers.push(() => {
          signal.removeEventListener("abort", abort);
        });
      }

      if (normalizedTimeoutMs !== undefined) {
        const timeoutHandle = setTimeout(() => {
          this.#rejectCompletion?.(
            new Error(
              `Timed out waiting for turn ${start.turn.id} to complete after ${normalizedTimeoutMs}ms.`
            )
          );
        }, normalizedTimeoutMs);
        timeoutHandle.unref?.();
        disposers.push(() => {
          clearTimeout(timeoutHandle);
        });
      }
    });
  }

  #accept(event: AppServerClientTurnStreamEvent): void {
    if (event.params.threadId !== this.#threadId) {
      return;
    }

    if (!this.#turnId) {
      this.#bufferedThreadEvents.push(event);
      return;
    }

    if (getTurnId(event) !== this.#turnId) {
      return;
    }

    this.#recordEvent(event);
  }

  #recordEvent(event: AppServerClientTurnStreamEvent): void {
    this.#events.push(event);
    this.#onEvent?.(event);

    switch (event.method) {
      case "turn/started":
        this.#started = event;
        break;
      case "item/agentMessage/delta":
        this.#agentMessageDeltas[event.params.itemId] =
          (this.#agentMessageDeltas[event.params.itemId] ?? "") + event.params.delta;
        break;
      case "item/completed":
        this.#completedItems.push(event.params.item);
        break;
      case "turn/completed":
        this.#completed = event;
        this.#resolveCompletion?.(
          this.#createResultFromCompletedEvent(event)
        );
        break;
      default:
        break;
    }
  }

  #createResult(start: TurnStartResponse): AppServerClientTurnRunResult {
    if (!this.#completed) {
      throw new Error(
        "Cannot create a streamed turn result before the turn has completed."
      );
    }

    this.#start = start;
    return this.#createResultFromCompletedEvent(this.#completed);
  }

  #createResultFromCompletedEvent(
    completed: AppServerClientTurnStreamEventOf<"turn/completed">
  ): AppServerClientTurnRunResult {
    if (!this.#start) {
      throw new Error(
        "Cannot create a streamed turn result before the turn/start response is available."
      );
    }

    return {
      start: this.#start,
      started: this.#started,
      completed,
      events: [...this.#events],
      completedItems: [...this.#completedItems],
      agentMessageDeltas: { ...this.#agentMessageDeltas }
    };
  }
}

function mergeRequestOptions(
  options: AppServerClientTurnRunOptions
): RpcRequestOptions | undefined {
  if (!options.request && !options.signal) {
    return undefined;
  }

  const signal = options.request?.signal ?? options.signal;

  return signal === undefined
    ? { ...options.request }
    : {
        ...options.request,
        signal
      };
}

function getTurnId(event: AppServerClientTurnStreamEvent): string {
  switch (event.method) {
    case "turn/started":
    case "turn/completed":
      return event.params.turn.id;
    default:
      return event.params.turnId;
  }
}

function normalizeTimeoutMs(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs === undefined) {
    return undefined;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError("completionTimeoutMs must be a finite non-negative number.");
  }

  return timeoutMs;
}

function createAbortError(reason: unknown): Error {
  const error = asError(
    reason ?? new Error("The streamed turn run was aborted.")
  );
  error.name = "AbortError";
  return error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
