import {
  RpcSession,
  RpcStateError,
  type RpcId,
  type RpcInboundRequest,
  type RpcNotificationMessage
} from "../rpc/index.js";
import type {
  AppInfo,
  AppsListParams,
  AppsListResponse,
  InitializeParams,
  InitializeResponse,
  Model,
  ModelListParams,
  ModelListResponse,
  SkillsListEntry,
  SkillsListParams,
  SkillsListResponse,
  Thread,
  ThreadListParams,
  ThreadListResponse,
  ThreadLoadedListParams,
  ThreadLoadedListResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadStartParams,
  ThreadStartResponse
} from "../protocol/index.js";
import type { JsonValue, Transport, TransportState } from "../transport/transport.js";

type StableClientRequestMap = {
  readonly "app/list": {
    readonly params: AppsListParams;
    readonly response: AppsListResponse;
  };
  readonly "model/list": {
    readonly params: ModelListParams;
    readonly response: ModelListResponse;
  };
  readonly "skills/list": {
    readonly params: SkillsListParams;
    readonly response: SkillsListResponse;
  };
  readonly "thread/list": {
    readonly params: ThreadListParams;
    readonly response: ThreadListResponse;
  };
  readonly "thread/loaded/list": {
    readonly params: ThreadLoadedListParams;
    readonly response: ThreadLoadedListResponse;
  };
  readonly "thread/read": {
    readonly params: ThreadReadParams;
    readonly response: ThreadReadResponse;
  };
  readonly "thread/resume": {
    readonly params: ThreadResumeParams;
    readonly response: ThreadResumeResponse;
  };
  readonly "thread/start": {
    readonly params: ThreadStartParams;
    readonly response: ThreadStartResponse;
  };
};

export type AppServerClientModel = Model;
export type AppServerClientSkill = SkillsListEntry;
export type AppServerClientApp = AppInfo;
export type AppServerClientThread = Thread;

export interface AppServerClientThreadApi {
  start(params: ThreadStartParams): Promise<ThreadStartResponse>;
  /**
   * Resume reloads an existing thread from persisted rollout history. The
   * server may reject ids for freshly started threads that have not produced a
   * resumable rollout yet, so callers should treat thread ids as resumable only
   * after the backing session has been materialized by the server.
   */
  resume(params: ThreadResumeParams): Promise<ThreadResumeResponse>;
  read(params: ThreadReadParams): Promise<ThreadReadResponse>;
  list(params?: ThreadListParams): Promise<ThreadListResponse>;
  loadedList(
    params?: ThreadLoadedListParams
  ): Promise<ThreadLoadedListResponse>;
}

export interface AppServerClientOptions {
  readonly transport: Transport;
  readonly requestIdFactory?: () => RpcId;
}

export interface AppServerClientInitializeOptions {
  /**
   * Defaults to true so the ergonomic client completes the required
   * initialize -> initialized handshake in one call.
   */
  readonly sendInitialized?: boolean;
}

export class AppServerClient {
  readonly #session: RpcSession;

  #initializeParams: InitializeParams | undefined;
  #initializePromise: Promise<InitializeResponse> | undefined;
  #initializeResponse: InitializeResponse | undefined;
  #initializedPromise: Promise<void> | undefined;

  public readonly thread: AppServerClientThreadApi;

  public constructor(options: AppServerClientOptions) {
    this.#session = new RpcSession(options);
    // Bind namespace helpers once so callers can safely pass them around
    // without losing the client instance that owns the underlying session.
    this.thread = {
      start: async (params) => await this.#request("thread/start", params),
      resume: async (params) => await this.#request("thread/resume", params),
      read: async (params) => await this.#request("thread/read", params),
      list: async (params = {}) => await this.#request("thread/list", params),
      loadedList: async (params = {}) =>
        await this.#request("thread/loaded/list", params)
    };
  }

  public get state(): TransportState {
    return this.#session.state;
  }

  public get initializationState(): RpcSession["initializationState"] {
    return this.#session.initializationState;
  }

  public async start(): Promise<void> {
    this.#ensureNotClosed("start");
    await this.#session.start();
  }

  public async close(): Promise<void> {
    await this.#session.close();
  }

  public async initialize(
    params: InitializeParams,
    options: AppServerClientInitializeOptions = {}
  ): Promise<InitializeResponse> {
    this.#ensureNotClosed("initialize");
    await this.start();

    const response = await this.#initializeOnce(params);

    if (options.sendInitialized ?? true) {
      await this.initialized();
    }

    return response;
  }

  public async initialized(): Promise<void> {
    this.#ensureNotClosed('send "initialized"');

    if (this.#session.initializationState === "initialized") {
      return;
    }

    if (!this.#initializedPromise) {
      this.#initializedPromise = this.#sendInitialized().finally(() => {
        this.#initializedPromise = undefined;
      });
    }

    await this.#initializedPromise;
  }

  public async appList(
    params: AppsListParams = {}
  ): Promise<AppsListResponse> {
    return await this.#request("app/list", params);
  }

  public async modelList(
    params: ModelListParams = {}
  ): Promise<ModelListResponse> {
    return await this.#request("model/list", params);
  }

  public async skillsList(
    params: SkillsListParams = {}
  ): Promise<SkillsListResponse> {
    return await this.#request("skills/list", params);
  }

  public onNotification(
    listener: (notification: RpcNotificationMessage) => void
  ): () => void {
    // Keep this surface at raw RPC fidelity until the client grows the
    // method-specific validation needed for a sound typed event API.
    return this.#session.onNotification(listener);
  }

  public onRequest(
    listener: (request: RpcInboundRequest) => void
  ): () => void {
    // Server-initiated requests are exposed as raw RPC objects for now so the
    // wrapper does not over-promise payload typing that it has not validated.
    return this.#session.onRequest(listener);
  }

  public onError(listener: (error: Error) => void): () => void {
    return this.#session.onError(listener);
  }

  public onClose(listener: (error?: Error) => void): () => void {
    return this.#session.onClose(listener);
  }

  async #initializeOnce(params: InitializeParams): Promise<InitializeResponse> {
    this.#assertMatchingInitializeParams(params);

    if (this.#initializeResponse) {
      return this.#initializeResponse;
    }

    if (!this.#initializePromise) {
      this.#initializeParams = params;
      this.#initializePromise = this.#session
        .request("initialize", params as JsonValue)
        .then((response) => {
          const typedResponse = response as InitializeResponse;
          this.#initializeResponse = typedResponse;
          return typedResponse;
        })
        .catch((error: unknown) => {
          this.#initializeParams = undefined;
          throw error;
        })
        .finally(() => {
          this.#initializePromise = undefined;
        });
    }

    return await this.#initializePromise;
  }

  async #sendInitialized(): Promise<void> {
    if (this.#session.initializationState === "initialized") {
      return;
    }

    await this.#session.initialized();
  }

  async #request<Method extends keyof StableClientRequestMap>(
    method: Method,
    params: StableClientRequestMap[Method]["params"]
  ): Promise<StableClientRequestMap[Method]["response"]> {
    return (await this.#session.request(
      method,
      params as JsonValue
    )) as StableClientRequestMap[Method]["response"];
  }

  #assertMatchingInitializeParams(params: InitializeParams): void {
    if (this.#initializeParams === undefined) {
      return;
    }

    // A connection only accepts one initialize request. Locking the first
    // payload prevents a reused client instance from silently mixing two
    // incompatible handshake assumptions on the same session.
    if (jsonValuesEqual(this.#initializeParams as JsonValue, params as JsonValue)) {
      return;
    }

    throw new RpcStateError(
      "Cannot reuse the same client session with different initialize parameters."
    );
  }

  #ensureNotClosed(action: string): void {
    if (this.#session.initializationState === "closed") {
      throw new RpcStateError(`Cannot ${action} after the client has closed.`);
    }
  }
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]!))
    );
  }

  if (isJsonObject(left) && isJsonObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) &&
          jsonValuesEqual(left[key]!, right[key]!)
      )
    );
  }

  return false;
}

function isJsonObject(
  value: JsonValue
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
