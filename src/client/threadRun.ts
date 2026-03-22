import type { RpcRequestOptions } from "../rpc/index.js";
import type {
  ThreadStartParams,
  ThreadStartResponse,
  TurnStartParams
} from "../protocol/index.js";
import type {
  AppServerClientTurnRunOptions,
  AppServerClientTurnRunResult
} from "./turnRun.js";

export interface AppServerClientThreadRunParams {
  /**
   * Parameters forwarded to `thread/start`.
   */
  readonly thread: ThreadStartParams;
  /**
   * Parameters forwarded to the initial `turn/start` after the thread id is
   * known. The helper fills `threadId` from the thread-start response so the
   * two calls cannot drift apart.
   */
  readonly turn: Omit<TurnStartParams, "threadId">;
}

export interface AppServerClientThreadRunOptions {
  /**
   * Request options forwarded to `thread/start`.
   */
  readonly request?: RpcRequestOptions;
  /**
   * Options forwarded to the initial `turn.run()` call.
   */
  readonly turn?: AppServerClientTurnRunOptions;
}

export interface AppServerClientThreadRunResult {
  /**
   * Immediate `thread/start` response returned by app-server.
   */
  readonly thread: ThreadStartResponse;
  /**
   * Streamed result for the initial turn started on the new thread.
   */
  readonly turn: AppServerClientTurnRunResult;
}

export interface ThreadRunEventSource {
  readonly thread: {
    start(
      params: ThreadStartParams,
      options?: RpcRequestOptions
    ): Promise<ThreadStartResponse>;
  };
  readonly turn: {
    run(
      params: TurnStartParams,
      options?: AppServerClientTurnRunOptions
    ): Promise<AppServerClientTurnRunResult>;
  };
}

export async function runThreadWithInitialTurn(
  source: ThreadRunEventSource,
  params: AppServerClientThreadRunParams,
  options: AppServerClientThreadRunOptions = {}
): Promise<AppServerClientThreadRunResult> {
  const thread = await source.thread.start(params.thread, options.request);
  const turn = await source.turn.run(
    {
      ...params.turn,
      threadId: thread.thread.id
    },
    options.turn
  );

  return {
    thread,
    turn
  };
}
