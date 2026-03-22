import {
  type RpcRequestOptions,
  RpcSession,
  type RpcErrorObject,
  RpcStateError,
  type RpcId,
  type RpcInboundRequest,
  type RpcNotificationMessage
} from "../rpc/index.js";
import {
  runTurnWithStream,
  type AppServerClientTurnRunOptions,
  type AppServerClientTurnRunResult
} from "./turnRun.js";
import type {
  Account,
  AppInfo,
  AppsListParams,
  AppsListResponse,
  CancelLoginAccountParams,
  CancelLoginAccountResponse,
  ChatgptAuthTokensRefreshParams,
  ChatgptAuthTokensRefreshResponse,
  CommandExecParams,
  CommandExecResizeParams,
  CommandExecResizeResponse,
  CommandExecResponse,
  CommandExecTerminateParams,
  CommandExecTerminateResponse,
  CommandExecWriteParams,
  CommandExecWriteResponse,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  DynamicToolCallParams,
  DynamicToolCallResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  FsCopyParams,
  FsCopyResponse,
  FsCreateDirectoryParams,
  FsCreateDirectoryResponse,
  FsGetMetadataParams,
  FsGetMetadataResponse,
  FsReadDirectoryParams,
  FsReadDirectoryResponse,
  InitializeParams,
  InitializeResponse,
  GetAccountParams,
  GetAccountRateLimitsResponse,
  GetAccountResponse,
  LoginAccountParams,
  LoginAccountResponse,
  LogoutAccountResponse,
  McpServerElicitationRequestParams,
  McpServerElicitationRequestResponse,
  Model,
  ModelListParams,
  ModelListResponse,
  PermissionsRequestApprovalParams,
  PermissionsRequestApprovalResponse,
  FsReadFileParams,
  FsReadFileResponse,
  FsRemoveParams,
  FsRemoveResponse,
  FsWriteFileParams,
  FsWriteFileResponse,
  SkillsListEntry,
  SkillsListParams,
  SkillsListResponse,
  ApplyPatchApprovalParams,
  ApplyPatchApprovalResponse,
  ExecCommandApprovalParams,
  ExecCommandApprovalResponse,
  ServerNotification,
  ServerRequest,
  Thread,
  ThreadListParams,
  ThreadListResponse,
  ThreadLoadedListParams,
  ThreadLoadedListResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  Turn,
  TurnInterruptParams,
  TurnInterruptResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse
} from "../protocol/index.js";
import type { JsonValue, Transport, TransportState } from "../transport/transport.js";

type StableClientRequestMap = {
  readonly "account/login/cancel": {
    readonly params: CancelLoginAccountParams;
    readonly response: CancelLoginAccountResponse;
  };
  readonly "account/login/start": {
    readonly params: LoginAccountParams;
    readonly response: LoginAccountResponse;
  };
  readonly "account/logout": {
    readonly params: undefined;
    readonly response: LogoutAccountResponse;
  };
  readonly "account/rateLimits/read": {
    readonly params: undefined;
    readonly response: GetAccountRateLimitsResponse;
  };
  readonly "account/read": {
    readonly params: GetAccountParams;
    readonly response: GetAccountResponse;
  };
  readonly "app/list": {
    readonly params: AppsListParams;
    readonly response: AppsListResponse;
  };
  readonly "command/exec": {
    readonly params: CommandExecParams;
    readonly response: CommandExecResponse;
  };
  readonly "command/exec/write": {
    readonly params: CommandExecWriteParams;
    readonly response: CommandExecWriteResponse;
  };
  readonly "command/exec/terminate": {
    readonly params: CommandExecTerminateParams;
    readonly response: CommandExecTerminateResponse;
  };
  readonly "command/exec/resize": {
    readonly params: CommandExecResizeParams;
    readonly response: CommandExecResizeResponse;
  };
  readonly "fs/copy": {
    readonly params: FsCopyParams;
    readonly response: FsCopyResponse;
  };
  readonly "fs/createDirectory": {
    readonly params: FsCreateDirectoryParams;
    readonly response: FsCreateDirectoryResponse;
  };
  readonly "fs/getMetadata": {
    readonly params: FsGetMetadataParams;
    readonly response: FsGetMetadataResponse;
  };
  readonly "fs/readDirectory": {
    readonly params: FsReadDirectoryParams;
    readonly response: FsReadDirectoryResponse;
  };
  readonly "fs/readFile": {
    readonly params: FsReadFileParams;
    readonly response: FsReadFileResponse;
  };
  readonly "fs/remove": {
    readonly params: FsRemoveParams;
    readonly response: FsRemoveResponse;
  };
  readonly "fs/writeFile": {
    readonly params: FsWriteFileParams;
    readonly response: FsWriteFileResponse;
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
  readonly "turn/start": {
    readonly params: TurnStartParams;
    readonly response: TurnStartResponse;
  };
  readonly "turn/steer": {
    readonly params: TurnSteerParams;
    readonly response: TurnSteerResponse;
  };
  readonly "turn/interrupt": {
    readonly params: TurnInterruptParams;
    readonly response: TurnInterruptResponse;
  };
};

type StableServerRequestMap = {
  readonly "account/chatgptAuthTokens/refresh": {
    readonly params: ChatgptAuthTokensRefreshParams;
    readonly response: ChatgptAuthTokensRefreshResponse;
  };
  readonly applyPatchApproval: {
    readonly params: ApplyPatchApprovalParams;
    readonly response: ApplyPatchApprovalResponse;
  };
  readonly execCommandApproval: {
    readonly params: ExecCommandApprovalParams;
    readonly response: ExecCommandApprovalResponse;
  };
  readonly "item/commandExecution/requestApproval": {
    readonly params: CommandExecutionRequestApprovalParams;
    readonly response: CommandExecutionRequestApprovalResponse;
  };
  readonly "item/fileChange/requestApproval": {
    readonly params: FileChangeRequestApprovalParams;
    readonly response: FileChangeRequestApprovalResponse;
  };
  readonly "item/permissions/requestApproval": {
    readonly params: PermissionsRequestApprovalParams;
    readonly response: PermissionsRequestApprovalResponse;
  };
  readonly "item/tool/call": {
    readonly params: DynamicToolCallParams;
    readonly response: DynamicToolCallResponse;
  };
  readonly "item/tool/requestUserInput": {
    readonly params: ToolRequestUserInputParams;
    readonly response: ToolRequestUserInputResponse;
  };
  readonly "mcpServer/elicitation/request": {
    readonly params: McpServerElicitationRequestParams;
    readonly response: McpServerElicitationRequestResponse;
  };
};

export type AppServerClientModel = Model;
export type AppServerClientSkill = SkillsListEntry;
export type AppServerClientApp = AppInfo;
export type AppServerClientAccount = Account;
export type AppServerClientThread = Thread;
export type AppServerClientTurn = Turn;
export type AppServerClientNotification = ServerNotification;
export type AppServerClientEventMethod = AppServerClientNotification["method"];
export type AppServerClientNotificationOf<
  Method extends AppServerClientEventMethod
> = Extract<AppServerClientNotification, { method: Method }>;
export type AppServerClientRequest = ServerRequest;
export type AppServerClientRequestMethod = keyof StableServerRequestMap;
export type AppServerClientRequestOf<Method extends AppServerClientRequestMethod> =
  Extract<AppServerClientRequest, { method: Method }>;
export type AppServerClientRequestResponseOf<
  Method extends AppServerClientRequestMethod
> = StableServerRequestMap[Method]["response"];
export type AppServerClientInboundRequest<
  Method extends AppServerClientRequestMethod
> = {
  readonly id: AppServerClientRequestOf<Method>["id"];
  readonly method: Method;
  readonly params: StableServerRequestMap[Method]["params"];
  respond(result: StableServerRequestMap[Method]["response"]): Promise<void>;
  respondError(error: RpcErrorObject): Promise<void>;
};
export type AppServerClientRequestHandler<
  Method extends AppServerClientRequestMethod
> = (
  request: AppServerClientInboundRequest<Method>
) =>
  | AppServerClientRequestResponseOf<Method>
  | Promise<AppServerClientRequestResponseOf<Method>>;

export interface AppServerClientRequestOptions extends RpcRequestOptions {}

export interface AppServerClientAccountApi {
  /**
   * Read the currently active account session. The helper defaults
   * `refreshToken` to `false` so callers opt into refresh work explicitly.
   */
  read(
    params?: GetAccountParams,
    options?: AppServerClientRequestOptions
  ): Promise<GetAccountResponse>;
  /**
   * Start an account login flow for API keys, browser-based ChatGPT auth, or
   * externally managed ChatGPT auth tokens.
   */
  loginStart(
    params: LoginAccountParams,
    options?: AppServerClientRequestOptions
  ): Promise<LoginAccountResponse>;
  /**
   * Cancel a previously started browser-based ChatGPT login flow.
   */
  loginCancel(
    params: CancelLoginAccountParams,
    options?: AppServerClientRequestOptions
  ): Promise<CancelLoginAccountResponse>;
  /**
   * Clear any currently active account session from the server process.
   */
  logout(
    options?: AppServerClientRequestOptions
  ): Promise<LogoutAccountResponse>;
  /**
   * Read the current rate-limit snapshot for the active account session.
   */
  rateLimitsRead(
    options?: AppServerClientRequestOptions
  ): Promise<GetAccountRateLimitsResponse>;
}

export interface AppServerClientThreadApi {
  start(
    params: ThreadStartParams,
    options?: AppServerClientRequestOptions
  ): Promise<ThreadStartResponse>;
  /**
   * Resume reloads an existing thread from persisted rollout history. The
   * server may reject ids for freshly started threads that have not produced a
   * resumable rollout yet, so callers should treat thread ids as resumable only
   * after the backing session has been materialized by the server.
   */
  resume(
    params: ThreadResumeParams,
    options?: AppServerClientRequestOptions
  ): Promise<ThreadResumeResponse>;
  read(
    params: ThreadReadParams,
    options?: AppServerClientRequestOptions
  ): Promise<ThreadReadResponse>;
  list(
    params?: ThreadListParams,
    options?: AppServerClientRequestOptions
  ): Promise<ThreadListResponse>;
  loadedList(
    params?: ThreadLoadedListParams,
    options?: AppServerClientRequestOptions
  ): Promise<ThreadLoadedListResponse>;
}

export interface AppServerClientTurnApi {
  /**
   * Start a new turn on an existing thread. The server streams the turn's
   * progress via notifications and sends the final state separately, so callers
   * should usually pair this with notification handling when they need to wait
   * for completion.
   */
  start(
    params: TurnStartParams,
    options?: AppServerClientRequestOptions
  ): Promise<TurnStartResponse>;
  /**
   * Steer adds more user input to the currently active turn. Callers must pass
   * the active turn id they expect so the server can reject stale steering
   * attempts after the turn has already advanced or completed.
   */
  steer(
    params: TurnSteerParams,
    options?: AppServerClientRequestOptions
  ): Promise<TurnSteerResponse>;
  /**
   * Interrupt asks the server to stop an in-progress turn. Completion still
   * arrives asynchronously via later notifications or a follow-up thread read.
   */
  interrupt(
    params: TurnInterruptParams,
    options?: AppServerClientRequestOptions
  ): Promise<TurnInterruptResponse>;
  /**
   * Start a turn and collect its lifecycle notifications until the matching
   * `turn/completed` event arrives.
   *
   * The helper tolerates callers opting out of intermediate event classes such
   * as `turn/started` or `item/agentMessage/delta`, but it still depends on
   * `turn/completed` to know when the turn has finished.
   */
  run(
    params: TurnStartParams,
    options?: AppServerClientTurnRunOptions
  ): Promise<AppServerClientTurnRunResult>;
}

export interface AppServerClientCommandApi {
  /**
   * Run a standalone command outside thread/turn execution.
   *
   * Buffered execution can omit `processId`, but callers that need follow-up
   * stdin writes, PTY resizing, termination, or streamed output must supply a
   * stable connection-scoped `processId` on the initial request.
   */
  exec(
    params: CommandExecParams,
    options?: AppServerClientRequestOptions
  ): Promise<CommandExecResponse>;
  /**
   * Write base64-encoded stdin bytes to a previously started command session,
   * optionally closing stdin after the write.
   */
  write(
    params: CommandExecWriteParams,
    options?: AppServerClientRequestOptions
  ): Promise<CommandExecWriteResponse>;
  /**
   * Resize the PTY for a previously started command session.
   *
   * This is only meaningful for commands that were started with `tty: true`.
   */
  resize(
    params: CommandExecResizeParams,
    options?: AppServerClientRequestOptions
  ): Promise<CommandExecResizeResponse>;
  /**
   * Terminate a previously started command session identified by `processId`.
   */
  terminate(
    params: CommandExecTerminateParams,
    options?: AppServerClientRequestOptions
  ): Promise<CommandExecTerminateResponse>;
}

export interface AppServerClientFsApi {
  /**
   * Read a file from the host filesystem as a base64 payload.
   */
  readFile(
    params: FsReadFileParams,
    options?: AppServerClientRequestOptions
  ): Promise<FsReadFileResponse>;
  /**
   * Write a full base64 payload to a file on the host filesystem.
   */
  writeFile(
    params: FsWriteFileParams,
    options?: AppServerClientRequestOptions
  ): Promise<FsWriteFileResponse>;
  /**
   * Create a directory on the host filesystem.
   */
  createDirectory(
    params: FsCreateDirectoryParams,
    options?: AppServerClientRequestOptions
  ): Promise<FsCreateDirectoryResponse>;
  /**
   * Inspect whether a path currently resolves to a file or directory and read
   * its available timestamps.
   */
  getMetadata(
    params: FsGetMetadataParams,
    options?: AppServerClientRequestOptions
  ): Promise<FsGetMetadataResponse>;
  /**
   * List the direct children of a directory.
   */
  readDirectory(
    params: FsReadDirectoryParams,
    options?: AppServerClientRequestOptions
  ): Promise<FsReadDirectoryResponse>;
  /**
   * Remove a file or directory tree from the host filesystem.
   */
  remove(
    params: FsRemoveParams,
    options?: AppServerClientRequestOptions
  ): Promise<FsRemoveResponse>;
  /**
   * Copy a file or directory tree on the host filesystem.
   */
  copy(
    params: FsCopyParams,
    options?: AppServerClientRequestOptions
  ): Promise<FsCopyResponse>;
}

export interface AppServerClientOptions {
  readonly transport: Transport;
  readonly requestIdFactory?: () => RpcId;
  readonly defaultRequestTimeoutMs?: number;
}

export interface AppServerClientInitializeOptions {
  /**
   * Defaults to true so the ergonomic client completes the required
   * initialize -> initialized handshake in one call.
   */
  readonly sendInitialized?: boolean;
  readonly request?: AppServerClientRequestOptions;
}

const INTERNAL_RPC_ERROR_CODE = -32603;

type TypedRequestWrapper<Method extends AppServerClientRequestMethod> = {
  readonly request: AppServerClientInboundRequest<Method>;
  readonly wasResponded: () => boolean;
};

export class AppServerClient {
  readonly #autoHandledRequestMethods =
    new Set<AppServerClientRequestMethod>();
  readonly #session: RpcSession;

  #initializeParams: InitializeParams | undefined;
  #initializePromise: Promise<InitializeResponse> | undefined;
  #initializeResponse: InitializeResponse | undefined;
  #initializedPromise: Promise<void> | undefined;

  public readonly thread: AppServerClientThreadApi;
  public readonly turn: AppServerClientTurnApi;
  public readonly command: AppServerClientCommandApi;
  public readonly fs: AppServerClientFsApi;
  public readonly account: AppServerClientAccountApi;

  public constructor(options: AppServerClientOptions) {
    this.#session = new RpcSession(options);
    // Bind namespace helpers once so callers can safely pass them around
    // without losing the client instance that owns the underlying session.
    this.thread = {
      start: async (params, options) =>
        await this.#request("thread/start", params, options),
      resume: async (params, options) =>
        await this.#request("thread/resume", params, options),
      read: async (params, options) =>
        await this.#request("thread/read", params, options),
      list: async (params = {}, options) =>
        await this.#request("thread/list", params, options),
      loadedList: async (params = {}, options) =>
        await this.#request("thread/loaded/list", params, options)
    };
    this.turn = {
      start: async (params, options) =>
        await this.#request("turn/start", params, options),
      steer: async (params, options) =>
        await this.#request("turn/steer", params, options),
      interrupt: async (params, options) =>
        await this.#request("turn/interrupt", params, options),
      run: async (params, options) => await runTurnWithStream(this, params, options)
    };
    this.command = {
      exec: async (params, options) =>
        await this.#request("command/exec", params, options),
      write: async (params, options) =>
        await this.#request("command/exec/write", params, options),
      resize: async (params, options) =>
        await this.#request("command/exec/resize", params, options),
      terminate: async (params, options) =>
        await this.#request("command/exec/terminate", params, options)
    };
    this.fs = {
      readFile: async (params, options) =>
        await this.#request("fs/readFile", params, options),
      writeFile: async (params, options) =>
        await this.#request("fs/writeFile", params, options),
      createDirectory: async (params, options) =>
        await this.#request("fs/createDirectory", params, options),
      getMetadata: async (params, options) =>
        await this.#request("fs/getMetadata", params, options),
      readDirectory: async (params, options) =>
        await this.#request("fs/readDirectory", params, options),
      remove: async (params, options) =>
        await this.#request("fs/remove", params, options),
      copy: async (params, options) =>
        await this.#request("fs/copy", params, options)
    };
    this.account = {
      read: async (params = { refreshToken: false }, options) =>
        await this.#request("account/read", params, options),
      loginStart: async (params, options) =>
        await this.#request("account/login/start", params, options),
      loginCancel: async (params, options) =>
        await this.#request("account/login/cancel", params, options),
      logout: async (options) =>
        await this.#request("account/logout", undefined, options),
      rateLimitsRead: async (options) =>
        await this.#request("account/rateLimits/read", undefined, options)
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

    const response = await this.#initializeOnce(params, options.request);

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
    params: AppsListParams = {},
    options?: AppServerClientRequestOptions
  ): Promise<AppsListResponse> {
    return await this.#request("app/list", params, options);
  }

  public async modelList(
    params: ModelListParams = {},
    options?: AppServerClientRequestOptions
  ): Promise<ModelListResponse> {
    return await this.#request("model/list", params, options);
  }

  public async skillsList(
    params: SkillsListParams = {},
    options?: AppServerClientRequestOptions
  ): Promise<SkillsListResponse> {
    return await this.#request("skills/list", params, options);
  }

  public onNotification(
    listener: (notification: RpcNotificationMessage) => void
  ): () => void {
    // Keep the raw RPC surface available for callers that need full protocol
    // fidelity, including notification methods the ergonomic client has not
    // wrapped further yet.
    return this.#session.onNotification(listener);
  }

  /**
   * Subscribe to a generated server notification method.
   *
   * app-server drives turn progress through ordered notifications: a turn emits
   * `turn/started`, each streamed item emits `item/started`, then any
   * item-specific delta/progress notifications, then `item/completed`, and the
   * turn finishes with `turn/completed`.
   *
   * Callers can opt out of specific notification methods during initialize, so
   * helpers built on top of this stream should tolerate missing lifecycle
   * events when the connection has method-level suppression enabled.
   */
  public onEvent<Method extends AppServerClientEventMethod>(
    method: Method,
    listener: (notification: AppServerClientNotificationOf<Method>) => void
  ): () => void {
    return this.#session.onNotification((notification) => {
      if (notification.method !== method) {
        return;
      }

      // Method names come from the generated protocol union. We currently trust
      // app-server to pair each known method with the documented payload shape,
      // so this narrows by method without re-validating the full params object.
      listener(notification as AppServerClientNotificationOf<Method>);
    });
  }

  public onRequest(
    listener: (request: RpcInboundRequest) => void
  ): () => void {
    // Server-initiated requests are exposed as raw RPC objects for now so the
    // wrapper does not over-promise payload typing that it has not validated.
    return this.#session.onRequest(listener);
  }

  /**
   * Subscribe to a specific server-initiated request method with generated
   * payload typing while keeping manual control over the response lifecycle.
   */
  public onServerRequest<Method extends AppServerClientRequestMethod>(
    method: Method,
    listener: (request: AppServerClientInboundRequest<Method>) => void
  ): () => void {
    return this.#session.onRequest((request) => {
      if (request.method !== method) {
        return;
      }

      listener(this.#createTypedRequestWrapper(method, request).request);
    });
  }

  /**
   * Register a convenience handler that automatically responds to matching
   * server requests with the generated response type for that method.
   *
   * Only one auto-handler may be active per method at a time so the client
   * cannot emit multiple JSON-RPC replies for the same inbound request.
   */
  public handleRequest<Method extends AppServerClientRequestMethod>(
    method: Method,
    handler: AppServerClientRequestHandler<Method>
  ): () => void {
    if (this.#autoHandledRequestMethods.has(method)) {
      throw new RpcStateError(
        `Cannot register more than one auto-handler for server request "${method}".`
      );
    }

    this.#autoHandledRequestMethods.add(method);

    const unsubscribe = this.#session.onRequest((request) => {
      if (request.method !== method) {
        return;
      }

      const wrapper = this.#createTypedRequestWrapper(method, request);
      let resultPromise: Promise<AppServerClientRequestResponseOf<Method>>;

      try {
        resultPromise = Promise.resolve(handler(wrapper.request));
      } catch (error) {
        resultPromise = Promise.reject(error);
      }

      void resultPromise
        .then(async (result) => {
          if (wrapper.wasResponded()) {
            return;
          }

          await wrapper.request.respond(result);
        })
        .catch(async (error: unknown) => {
          if (wrapper.wasResponded()) {
            return;
          }

          await wrapper.request.respondError({
            code: INTERNAL_RPC_ERROR_CODE,
            message: asError(error).message
          });
        });
    });

    return () => {
      this.#autoHandledRequestMethods.delete(method);
      unsubscribe();
    };
  }

  public onError(listener: (error: Error) => void): () => void {
    return this.#session.onError(listener);
  }

  public onClose(listener: (error?: Error) => void): () => void {
    return this.#session.onClose(listener);
  }

  async #initializeOnce(
    params: InitializeParams,
    requestOptions?: AppServerClientRequestOptions
  ): Promise<InitializeResponse> {
    this.#assertMatchingInitializeParams(params);

    if (this.#initializeResponse) {
      return this.#initializeResponse;
    }

    if (!this.#initializePromise) {
      this.#initializeParams = params;
      this.#initializePromise = this.#session
        .request("initialize", params as JsonValue, requestOptions)
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
    params: StableClientRequestMap[Method]["params"],
    options?: AppServerClientRequestOptions
  ): Promise<StableClientRequestMap[Method]["response"]> {
    return (await this.#session.request(
      method,
      params as JsonValue,
      options
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

  #createTypedRequestWrapper<Method extends AppServerClientRequestMethod>(
    method: Method,
    request: RpcInboundRequest
  ): TypedRequestWrapper<Method> {
    let responded = false;

    const assertCanRespond = (): void => {
      if (responded) {
        throw new RpcStateError(
          `Cannot respond to server request "${method}" more than once.`
        );
      }

      responded = true;
    };

    return {
      request: {
        id: request.id,
        method,
        params: request.params as StableServerRequestMap[Method]["params"],
        respond: async (result) => {
          assertCanRespond();
          await request.respond(result as JsonValue);
        },
        respondError: async (error) => {
          assertCanRespond();
          await request.respondError(error);
        }
      },
      wasResponded: () => responded
    };
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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
