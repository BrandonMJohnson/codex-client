import { ListenerSet } from "../transport/listenerSet.js";
import type {
  JsonValue,
  Transport,
  TransportCloseListener,
  TransportErrorListener,
  TransportMessageListener,
  TransportState
} from "../transport/transport.js";

import {
  RpcError,
  RpcRequestAbortedError,
  RpcRequestTimeoutError,
  RpcProtocolError,
  RpcResponseError,
  RpcStateError
} from "./errors.js";
import type {
  RpcErrorObject,
  RpcErrorResponseMessage,
  RpcId,
  RpcNotificationMessage,
  RpcRequestMessage,
  RpcResponseMessage,
  RpcSuccessResponseMessage
} from "./messages.js";

type JsonObject = {
  readonly [key: string]: JsonValue;
};

type InitializationState =
  | "preInitialize"
  | "initializePending"
  | "initializeReady"
  | "initialized"
  | "closed";

// The server handshake requires an initialize request/response round-trip
// before the client may send the initialized notification and unlock other RPCs.
type PendingRequest = {
  readonly method: string;
  readonly resolve: (value: JsonValue) => void;
  readonly reject: (reason: Error) => void;
  readonly dispose: () => void;
};

export interface RpcInboundRequest extends RpcRequestMessage {
  respond(result?: JsonValue): Promise<void>;
  respondError(error: RpcErrorObject): Promise<void>;
}

export type RpcNotificationListener = (
  notification: RpcNotificationMessage
) => void;

export type RpcRequestListener = (request: RpcInboundRequest) => void;
export type RpcSessionErrorListener = (error: Error) => void;
export type RpcSessionCloseListener = (error?: Error) => void;

export interface RpcSessionOptions {
  readonly transport: Transport;
  readonly requestIdFactory?: () => RpcId;
  readonly defaultRequestTimeoutMs?: number;
}

export interface RpcRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export class RpcSession {
  readonly #closeListeners = new ListenerSet<RpcSessionCloseListener>();
  readonly #errorListeners = new ListenerSet<RpcSessionErrorListener>();
  readonly #notificationListeners = new ListenerSet<RpcNotificationListener>();
  readonly #pendingRequests = new Map<RpcId, PendingRequest>();
  readonly #requestListeners = new ListenerSet<RpcRequestListener>();
  readonly #transport: Transport;
  readonly #requestIdFactory: () => RpcId;
  readonly #defaultRequestTimeoutMs: number | undefined;

  #closeHandled = false;
  #initializationState: InitializationState = "preInitialize";
  #nextRequestId = 1;
  #started = false;
  #unsubscribeClose: (() => void) | undefined;
  #unsubscribeError: (() => void) | undefined;
  #unsubscribeMessage: (() => void) | undefined;

  public constructor(options: RpcSessionOptions) {
    this.#transport = options.transport;
    this.#requestIdFactory =
      options.requestIdFactory ?? (() => this.#nextRequestId++);
    this.#defaultRequestTimeoutMs = normalizeTimeoutMs(
      options.defaultRequestTimeoutMs,
      "defaultRequestTimeoutMs"
    );
  }

  public get state(): TransportState {
    return this.#transport.state;
  }

  public get initializationState(): InitializationState {
    return this.#initializationState;
  }

  public async start(): Promise<void> {
    if (this.#started) {
      return;
    }

    this.#unsubscribeMessage = this.#transport.onMessage(this.#handleMessage);
    this.#unsubscribeError = this.#transport.onError(this.#handleTransportError);
    this.#unsubscribeClose = this.#transport.onClose(this.#handleTransportClose);

    try {
      await this.#transport.start();
      this.#started = true;
    } catch (error) {
      this.#detachTransportListeners();
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (!this.#started) {
      await this.#transport.close();
      this.#finalizeClose();
      return;
    }

    await this.#transport.close();
  }

  public async request(
    method: string,
    params?: JsonValue,
    options: RpcRequestOptions = {}
  ): Promise<JsonValue> {
    this.#ensureOpen();
    const timeoutMs = normalizeTimeoutMs(
      options.timeoutMs ?? this.#defaultRequestTimeoutMs,
      "timeoutMs"
    );

    if (options.signal?.aborted) {
      throw createRequestAbortedError(method, options.signal.reason);
    }

    this.#prepareClientMethod(method);

    const id = this.#requestIdFactory();
    const message = createRequestMessage(id, method, params);

    return await new Promise<JsonValue>((resolve, reject) => {
      const disposeCallbacks: Array<() => void> = [];
      const dispose = (): void => {
        for (const callback of disposeCallbacks) {
          callback();
        }
      };

      this.#pendingRequests.set(id, {
        method,
        resolve,
        reject,
        dispose
      });

      if (options.signal) {
        const abortPendingRequest = (): void => {
          this.#cancelPendingRequest(
            id,
            createRequestAbortedError(method, options.signal?.reason)
          );
        };

        options.signal.addEventListener("abort", abortPendingRequest, {
          once: true
        });
        disposeCallbacks.push(() => {
          options.signal?.removeEventListener("abort", abortPendingRequest);
        });
      }

      if (timeoutMs !== undefined) {
        const timeoutHandle = setTimeout(() => {
          this.#cancelPendingRequest(
            id,
            new RpcRequestTimeoutError(method, timeoutMs)
          );
        }, timeoutMs);
        timeoutHandle.unref?.();
        disposeCallbacks.push(() => {
          clearTimeout(timeoutHandle);
        });
      }

      this.#transport
        .send(asJsonValueObject(message))
        .catch((error: unknown) => {
          this.#failPendingRequest(id, asError(error));
        });
    });
  }

  public async notify(method: string, params?: JsonValue): Promise<void> {
    this.#ensureOpen();
    this.#prepareClientMethod(method);

    await this.#sendNotification(method, params);

    if (method === "initialized") {
      this.#initializationState = "initialized";
    }
  }

  public async initialized(params?: JsonValue): Promise<void> {
    if (this.#initializationState !== "initializeReady") {
      throw new RpcStateError(
        'Cannot send "initialized" before "initialize" completes successfully.'
      );
    }

    await this.notify("initialized", params);
  }

  public async respond(id: RpcId, result?: JsonValue): Promise<void> {
    this.#ensureOpen();

    const message = createSuccessResponseMessage(id, result);

    await this.#transport.send(asJsonValueObject(message));
  }

  public async respondError(id: RpcId, error: RpcErrorObject): Promise<void> {
    this.#ensureOpen();
    validateErrorObject(error);
    await this.#transport.send(asJsonValueObject({ id, error }));
  }

  public onNotification(listener: RpcNotificationListener): () => void {
    return this.#notificationListeners.add(listener);
  }

  public onRequest(listener: RpcRequestListener): () => void {
    return this.#requestListeners.add(listener);
  }

  public onError(listener: RpcSessionErrorListener): () => void {
    return this.#errorListeners.add(listener);
  }

  public onClose(listener: RpcSessionCloseListener): () => void {
    return this.#closeListeners.add(listener);
  }

  readonly #handleMessage: TransportMessageListener = (message): void => {
    try {
      const classifiedMessage = classifyRpcMessage(message);

      switch (classifiedMessage.kind) {
        case "notification":
          this.#notificationListeners.notify(classifiedMessage.message);
          return;
        case "request":
          this.#requestListeners.notify({
            ...classifiedMessage.message,
            respond: async (result?: JsonValue) => {
              await this.respond(classifiedMessage.message.id, result);
            },
            respondError: async (error: RpcErrorObject) => {
              await this.respondError(classifiedMessage.message.id, error);
            }
          });
          return;
        case "response":
          this.#handleResponse(classifiedMessage.message);
          return;
      }
    } catch (error) {
      const rpcError = asError(error);
      this.#emitError(rpcError);
      this.#finalizeClose(rpcError);
      void this.#transport.close();
    }
  };

  readonly #handleTransportError: TransportErrorListener = (error): void => {
    this.#emitError(error);
  };

  readonly #handleTransportClose: TransportCloseListener = (error): void => {
    this.#finalizeClose(error);
  };

  async #sendNotification(
    method: string,
    params?: JsonValue
  ): Promise<void> {
    const message = createNotificationMessage(method, params);

    await this.#transport.send(asJsonValueObject(message));
  }

  #prepareClientMethod(method: string): void {
    if (method === "initialize") {
      if (this.#initializationState !== "preInitialize") {
        throw new RpcStateError(
          'Cannot send "initialize" more than once on the same session.'
        );
      }

      this.#initializationState = "initializePending";
      return;
    }

    if (method === "initialized") {
      if (this.#initializationState !== "initializeReady") {
        throw new RpcStateError(
          'Cannot send "initialized" before "initialize" completes successfully.'
        );
      }

      return;
    }

    if (this.#initializationState !== "initialized") {
      throw new RpcStateError(
        `Cannot send "${method}" before the initialize handshake completes.`
      );
    }
  }

  #rollbackInitializationAfterSendFailure(method: string): void {
    if (method === "initialize") {
      this.#initializationState = "preInitialize";
    }
  }

  #handleResponse(message: RpcResponseMessage): void {
    const pendingRequest = this.#pendingRequests.get(message.id);
    if (!pendingRequest) {
      throw new RpcProtocolError(
        `Received a response for unknown request id "${String(message.id)}".`
      );
    }

    this.#pendingRequests.delete(message.id);
    pendingRequest.dispose();

    if ("error" in message) {
      if (pendingRequest.method === "initialize") {
        this.#initializationState = "preInitialize";
      }

      pendingRequest.reject(new RpcResponseError(message.id, message.error));
      return;
    }

    if (pendingRequest.method === "initialize") {
      this.#initializationState = "initializeReady";
    }

    pendingRequest.resolve(message.result);
  }

  #ensureOpen(): void {
    if (!this.#started) {
      throw new RpcStateError("Cannot use RPC session before it is started.");
    }

    if (this.#transport.state !== "open") {
      throw new RpcStateError(
        `Cannot use RPC session while transport is "${this.#transport.state}".`
      );
    }
  }

  #emitError(error: Error): void {
    this.#errorListeners.notify(error);
  }

  #cancelPendingRequest(id: RpcId, error: Error): void {
    const pendingRequest = this.#pendingRequests.get(id);
    if (!pendingRequest) {
      return;
    }

    this.#pendingRequests.delete(id);
    pendingRequest.dispose();
    pendingRequest.reject(error);

    if (pendingRequest.method === "initialize") {
      // Once initialize has been written to the transport, the client cannot
      // tell whether the server accepted it before the local timeout/abort.
      // Closing the session avoids sending a second initialize on a connection
      // whose handshake state may already have diverged.
      this.#finalizeClose(error);
      void this.#transport.close();
      return;
    }

    // The protocol has no request-cancellation message. Once a request has been
    // sent, abandoning it locally means a valid server response can still show
    // up later. Closing the session is the only protocol-safe way to avoid
    // misclassifying that late response or drifting out of sync with the
    // server's view of outstanding request ids.
    this.#finalizeClose(error);
    void this.#transport.close();
  }

  #failPendingRequest(id: RpcId, error: Error): void {
    const pendingRequest = this.#pendingRequests.get(id);
    if (!pendingRequest) {
      return;
    }

    this.#pendingRequests.delete(id);
    pendingRequest.dispose();
    this.#rollbackInitializationAfterSendFailure(pendingRequest.method);
    pendingRequest.reject(error);
  }

  #finalizeClose(error?: Error): void {
    if (this.#closeHandled) {
      return;
    }

    this.#closeHandled = true;
    this.#detachTransportListeners();
    this.#initializationState = "closed";

    const closeError = error ?? new RpcError("RPC session closed.");
    for (const pendingRequest of this.#pendingRequests.values()) {
      pendingRequest.dispose();
      pendingRequest.reject(closeError);
    }

    this.#pendingRequests.clear();
    this.#closeListeners.notify(error);
  }

  #detachTransportListeners(): void {
    this.#unsubscribeMessage?.();
    this.#unsubscribeMessage = undefined;
    this.#unsubscribeError?.();
    this.#unsubscribeError = undefined;
    this.#unsubscribeClose?.();
    this.#unsubscribeClose = undefined;
  }
}

function classifyRpcMessage(
  message: JsonValue
):
  | { kind: "notification"; message: RpcNotificationMessage }
  | { kind: "request"; message: RpcRequestMessage }
  | { kind: "response"; message: RpcResponseMessage } {
  if (!isJsonObject(message)) {
    throw new RpcProtocolError("RPC messages must be JSON objects.");
  }

  const method = message.method;
  const id = message.id;
  const hasMethod = method !== undefined;
  const hasId = id !== undefined;

  if (hasMethod) {
    if (typeof method !== "string") {
      throw new RpcProtocolError("RPC method names must be strings.");
    }

    if (message.params !== undefined && !isJsonValue(message.params)) {
      throw new RpcProtocolError("RPC params must be valid JSON values.");
    }

    if (hasId) {
      return {
        kind: "request",
        message: createRequestMessage(validateRpcId(id), method, message.params)
      };
    }

    return {
      kind: "notification",
      message: createNotificationMessage(method, message.params)
    };
  }

  if (!hasId) {
    throw new RpcProtocolError(
      "RPC messages must include either a method or an id."
    );
  }

  const responseId = validateRpcId(id);
  const hasResult = "result" in message;
  const hasError = "error" in message;

  if (hasResult === hasError) {
    throw new RpcProtocolError(
      "RPC responses must include exactly one of result or error."
    );
  }

  if (hasError) {
    return {
      kind: "response",
      message: {
        id: responseId,
        error: validateErrorObject(message.error)
      } satisfies RpcErrorResponseMessage
    };
  }

  return {
    kind: "response",
    message: createSuccessResponseMessage(responseId, message.result)
  };
}

function validateRpcId(value: JsonValue): RpcId {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  throw new RpcProtocolError("RPC ids must be strings or numbers.");
}

function validateErrorObject(value: unknown): RpcErrorObject {
  if (!isJsonObject(value)) {
    throw new RpcProtocolError("RPC error payloads must be JSON objects.");
  }

  if (typeof value.code !== "number") {
    throw new RpcProtocolError("RPC error codes must be numbers.");
  }

  if (typeof value.message !== "string") {
    throw new RpcProtocolError("RPC error messages must be strings.");
  }

  return createErrorObject(value.code, value.message, value.data);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(_value: JsonValue): _value is JsonValue {
  return true;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function asJsonValueObject<T extends object>(value: T): JsonValue {
  return value as JsonValue;
}

function createNotificationMessage(
  method: string,
  params?: JsonValue
): RpcNotificationMessage {
  if (params === undefined) {
    return { method };
  }

  return { method, params };
}

function createRequestMessage(
  id: RpcId,
  method: string,
  params?: JsonValue
): RpcRequestMessage {
  if (params === undefined) {
    return { id, method };
  }

  return { id, method, params };
}

function createSuccessResponseMessage(
  id: RpcId,
  result?: JsonValue
): RpcSuccessResponseMessage {
  return {
    id,
    result: result ?? null
  };
}

function createErrorObject(
  code: number,
  message: string,
  data?: JsonValue
): RpcErrorObject {
  if (data === undefined) {
    return { code, message };
  }

  return { code, message, data };
}

function normalizeTimeoutMs(
  value: number | undefined,
  optionName: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`RPC ${optionName} must be a finite number >= 0.`);
  }

  return value;
}

function createRequestAbortedError(
  method: string,
  reason: unknown
): RpcRequestAbortedError {
  const cause = reason instanceof Error ? reason : undefined;
  return new RpcRequestAbortedError(method, cause ? { cause } : undefined);
}
