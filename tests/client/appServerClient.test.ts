import { describe, expect, it } from "vitest";

import {
  AppServerClient,
  type CancelLoginAccountResponse,
  type CommandExecResizeResponse,
  type CommandExecResponse,
  type CommandExecTerminateResponse,
  type CommandExecWriteResponse,
  type FsCopyResponse,
  type FsCreateDirectoryResponse,
  type FsGetMetadataResponse,
  type FsReadDirectoryResponse,
  type FsReadFileResponse,
  type FsRemoveResponse,
  type FsWriteFileResponse,
  type GetAccountRateLimitsResponse,
  type GetAccountResponse,
  RpcResponseError,
  RpcStateError,
  type InitializeParams,
  type JsonValue,
  type LoginAccountResponse,
  type RpcNotificationMessage,
  type Thread,
  type ThreadReadResponse,
  type ThreadResumeResponse,
  type ThreadStartResponse,
  type Turn,
  type TurnInterruptResponse,
  type TurnStartResponse,
  type TurnSteerResponse,
  type Transport,
  type TransportCloseListener,
  type TransportErrorListener,
  type TransportMessageListener,
  type TransportState
} from "../../src/index.js";

class FakeTransport implements Transport {
  readonly sentMessages: JsonValue[] = [];

  #closeListeners = new Set<TransportCloseListener>();
  #errorListeners = new Set<TransportErrorListener>();
  #messageListeners = new Set<TransportMessageListener>();
  #state: TransportState = "idle";

  public get state(): TransportState {
    return this.#state;
  }

  public async start(): Promise<void> {
    this.#state = "open";
  }

  public async send(message: JsonValue): Promise<void> {
    if (this.#state !== "open") {
      throw new Error(`Transport is "${this.#state}".`);
    }

    this.sentMessages.push(message);
  }

  public async close(): Promise<void> {
    if (this.#state === "closed") {
      return;
    }

    this.#state = "closed";
    this.#emitClose();
  }

  public onMessage(listener: TransportMessageListener): () => void {
    this.#messageListeners.add(listener);
    return () => {
      this.#messageListeners.delete(listener);
    };
  }

  public onError(listener: TransportErrorListener): () => void {
    this.#errorListeners.add(listener);
    return () => {
      this.#errorListeners.delete(listener);
    };
  }

  public onClose(listener: TransportCloseListener): () => void {
    this.#closeListeners.add(listener);
    return () => {
      this.#closeListeners.delete(listener);
    };
  }

  public emitMessage(message: JsonValue): void {
    for (const listener of this.#messageListeners) {
      listener(message);
    }
  }

  #emitClose(error?: Error): void {
    for (const listener of this.#closeListeners) {
      listener(error);
    }
  }
}

describe("AppServerClient", () => {
  it("completes initialize and initialized in one call by default", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams());
    await flushAsyncWork();

    expect(transport.sentMessages).toEqual([
      {
        id: 1,
        method: "initialize",
        params: createInitializeParams()
      }
    ]);

    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });

    await expect(initialize).resolves.toEqual({
      userAgent: "codex",
      platformFamily: "unix",
      platformOs: "linux"
    });
    expect(client.initializationState).toBe("initialized");
    expect(transport.sentMessages[1]).toEqual({ method: "initialized" });

    const cached = await client.initialize(createInitializeParams());
    expect(cached.userAgent).toBe("codex");
    expect(transport.sentMessages).toHaveLength(2);
  });

  it("rejects repeated initialize calls that change handshake parameters", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams(), {
      sendInitialized: false
    });
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;

    await expect(
      client.initialize(
        {
          clientInfo: {
            name: "different-client",
            title: null,
            version: "2.0.0"
          },
          capabilities: null
        },
        { sendInitialized: false }
      )
    ).rejects.toBeInstanceOf(RpcStateError);
  });

  it("allows callers to defer initialized until they are ready", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams(), {
      sendInitialized: false
    });
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;

    await expect(client.modelList()).rejects.toBeInstanceOf(RpcStateError);

    await client.initialized();
    expect(transport.sentMessages[1]).toEqual({ method: "initialized" });

    const modelList = client.modelList({ includeHidden: true });
    await flushAsyncWork();
    expect(transport.sentMessages[2]).toEqual({
      id: 2,
      method: "model/list",
      params: { includeHidden: true }
    });

    transport.emitMessage({
      id: 2,
      result: {
        data: [],
        nextCursor: null
      }
    });

    await expect(modelList).resolves.toEqual({
      data: [],
      nextCursor: null
    });
  });

  it("allows initialize retries after an initialize error", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const firstInitialize = client.initialize(createInitializeParams(), {
      sendInitialized: false
    });
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      error: {
        code: -32000,
        message: "bad init"
      }
    });

    await expect(firstInitialize).rejects.toBeInstanceOf(RpcResponseError);

    const retryParams: InitializeParams = {
      clientInfo: {
        name: "retry-client",
        title: null,
        version: "1.0.1"
      },
      capabilities: null
    };

    const retry = client.initialize(retryParams, {
      sendInitialized: false
    });
    await flushAsyncWork();
    expect(transport.sentMessages[1]).toEqual({
      id: 2,
      method: "initialize",
      params: retryParams
    });

    transport.emitMessage({
      id: 2,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });

    await expect(retry).resolves.toEqual({
      userAgent: "codex",
      platformFamily: "unix",
      platformOs: "linux"
    });
  });

  it("passes raw notifications and server requests through the client surface", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });
    const notifications: RpcNotificationMessage[] = [];
    const requests: string[] = [];

    client.onNotification((notification) => {
      notifications.push(notification);
    });
    client.onRequest((request) => {
      requests.push(request.method);
      void request.respond();
    });

    const initialize = client.initialize(createInitializeParams());
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;
    transport.sentMessages.length = 0;

    transport.emitMessage({
      method: "turn/started",
      params: { turnId: "turn-1", threadId: "thread-1" }
    });
    transport.emitMessage({
      id: "req-1",
      method: "item/tool/call",
      params: { toolName: "echo" }
    });

    expect(notifications).toEqual([
      {
        method: "turn/started",
        params: { turnId: "turn-1", threadId: "thread-1" }
      }
    ]);
    expect(requests).toEqual(["item/tool/call"]);
    expect(transport.sentMessages).toEqual([{ id: "req-1", result: null }]);
  });

  it("routes thread namespace helpers to the stable thread RPC methods", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams());
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;
    transport.sentMessages.length = 0;

    const threadStart = client.thread.start({
      cwd: "/workspace",
      experimentalRawEvents: false,
      persistExtendedHistory: false
    });
    await flushAsyncWork();
    expect(transport.sentMessages[0]).toEqual({
      id: 2,
      method: "thread/start",
      params: {
        cwd: "/workspace",
        experimentalRawEvents: false,
        persistExtendedHistory: false
      }
    });
    transport.emitMessage({
      id: 2,
      result: createThreadStartResponse(createThread("thread-1")) as JsonValue
    });
    await expect(threadStart).resolves.toEqual(
      createThreadStartResponse(createThread("thread-1"))
    );

    const threadResume = client.thread.resume({
      threadId: "thread-1",
      persistExtendedHistory: true
    });
    await flushAsyncWork();
    expect(transport.sentMessages[1]).toEqual({
      id: 3,
      method: "thread/resume",
      params: {
        threadId: "thread-1",
        persistExtendedHistory: true
      }
    });
    const resumedThread = createThread("thread-1", {
      turns: [
        {
          id: "turn-1",
          items: [],
          status: "completed",
          error: null
        }
      ]
    });
    transport.emitMessage({
      id: 3,
      result: createThreadResumeResponse(resumedThread) as JsonValue
    });
    await expect(threadResume).resolves.toEqual(
      createThreadResumeResponse(resumedThread)
    );

    const threadRead = client.thread.read({
      threadId: "thread-1",
      includeTurns: true
    });
    await flushAsyncWork();
    expect(transport.sentMessages[2]).toEqual({
      id: 4,
      method: "thread/read",
      params: {
        threadId: "thread-1",
        includeTurns: true
      }
    });
    transport.emitMessage({
      id: 4,
      result: createThreadReadResponse(resumedThread) as JsonValue
    });
    await expect(threadRead).resolves.toEqual(createThreadReadResponse(resumedThread));

    const threadList = client.thread.list({
      limit: 10,
      searchTerm: "demo"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[3]).toEqual({
      id: 5,
      method: "thread/list",
      params: {
        limit: 10,
        searchTerm: "demo"
      }
    });
    transport.emitMessage({
      id: 5,
      result: {
        data: [createThread("thread-1")],
        nextCursor: "cursor-2"
      } as JsonValue
    });
    await expect(threadList).resolves.toEqual({
      data: [createThread("thread-1")],
      nextCursor: "cursor-2"
    });

    const loadedList = client.thread.loadedList({ limit: 5 });
    await flushAsyncWork();
    expect(transport.sentMessages[4]).toEqual({
      id: 6,
      method: "thread/loaded/list",
      params: { limit: 5 }
    });
    transport.emitMessage({
      id: 6,
      result: {
        data: ["thread-1"],
        nextCursor: null
      }
    });
    await expect(loadedList).resolves.toEqual({
      data: ["thread-1"],
      nextCursor: null
    });
  });

  it("routes turn namespace helpers to the stable turn RPC methods", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams());
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;
    transport.sentMessages.length = 0;

    const turnStart = client.turn.start({
      threadId: "thread-1",
      input: [
        {
          type: "text",
          text: "Say hello",
          text_elements: []
        }
      ]
    });
    await flushAsyncWork();
    expect(transport.sentMessages[0]).toEqual({
      id: 2,
      method: "turn/start",
      params: {
        threadId: "thread-1",
        input: [
          {
            type: "text",
            text: "Say hello",
            text_elements: []
          }
        ]
      }
    });
    transport.emitMessage({
      id: 2,
      result: createTurnStartResponse(createTurn("turn-1", "inProgress")) as JsonValue
    });
    await expect(turnStart).resolves.toEqual(
      createTurnStartResponse(createTurn("turn-1", "inProgress"))
    );

    const turnSteer = client.turn.steer({
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      input: [
        {
          type: "text",
          text: "Please keep it brief.",
          text_elements: []
        }
      ]
    });
    await flushAsyncWork();
    expect(transport.sentMessages[1]).toEqual({
      id: 3,
      method: "turn/steer",
      params: {
        threadId: "thread-1",
        expectedTurnId: "turn-1",
        input: [
          {
            type: "text",
            text: "Please keep it brief.",
            text_elements: []
          }
        ]
      }
    });
    transport.emitMessage({
      id: 3,
      result: createTurnSteerResponse("turn-1") as JsonValue
    });
    await expect(turnSteer).resolves.toEqual(createTurnSteerResponse("turn-1"));

    const turnInterrupt = client.turn.interrupt({
      threadId: "thread-1",
      turnId: "turn-1"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[2]).toEqual({
      id: 4,
      method: "turn/interrupt",
      params: {
        threadId: "thread-1",
        turnId: "turn-1"
      }
    });
    transport.emitMessage({
      id: 4,
      result: createTurnInterruptResponse() as JsonValue
    });
    await expect(turnInterrupt).resolves.toEqual(createTurnInterruptResponse());
  });

  it("routes command namespace helpers to the stable command RPC methods", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams());
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;
    transport.sentMessages.length = 0;

    const commandExec = client.command.exec({
      command: ["/bin/echo", "hello"],
      cwd: "/workspace",
      env: {
        TEST_ENV: "1"
      }
    });
    await flushAsyncWork();
    expect(transport.sentMessages[0]).toEqual({
      id: 2,
      method: "command/exec",
      params: {
        command: ["/bin/echo", "hello"],
        cwd: "/workspace",
        env: {
          TEST_ENV: "1"
        }
      }
    });
    transport.emitMessage({
      id: 2,
      result: createCommandExecResponse({
        exitCode: 0,
        stdout: "hello\n",
        stderr: ""
      }) as JsonValue
    });
    await expect(commandExec).resolves.toEqual(
      createCommandExecResponse({
        exitCode: 0,
        stdout: "hello\n",
        stderr: ""
      })
    );

    const commandWrite = client.command.write({
      processId: "proc-1",
      deltaBase64: "aGVsbG8=",
      closeStdin: true
    });
    await flushAsyncWork();
    expect(transport.sentMessages[1]).toEqual({
      id: 3,
      method: "command/exec/write",
      params: {
        processId: "proc-1",
        deltaBase64: "aGVsbG8=",
        closeStdin: true
      }
    });
    transport.emitMessage({
      id: 3,
      result: createEmptyCommandResponse() as JsonValue
    });
    await expect(commandWrite).resolves.toEqual(createEmptyCommandResponse());

    const commandResize = client.command.resize({
      processId: "proc-1",
      size: {
        cols: 120,
        rows: 40
      }
    });
    await flushAsyncWork();
    expect(transport.sentMessages[2]).toEqual({
      id: 4,
      method: "command/exec/resize",
      params: {
        processId: "proc-1",
        size: {
          cols: 120,
          rows: 40
        }
      }
    });
    transport.emitMessage({
      id: 4,
      result: createEmptyCommandResponse() as JsonValue
    });
    await expect(commandResize).resolves.toEqual(createEmptyCommandResponse());

    const commandTerminate = client.command.terminate({
      processId: "proc-1"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[3]).toEqual({
      id: 5,
      method: "command/exec/terminate",
      params: {
        processId: "proc-1"
      }
    });
    transport.emitMessage({
      id: 5,
      result: createEmptyCommandResponse() as JsonValue
    });
    await expect(commandTerminate).resolves.toEqual(createEmptyCommandResponse());
  });

  it("routes fs namespace helpers to the stable fs RPC methods", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams());
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;
    transport.sentMessages.length = 0;

    const readFile = client.fs.readFile({
      path: "/workspace/source.txt"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[0]).toEqual({
      id: 2,
      method: "fs/readFile",
      params: {
        path: "/workspace/source.txt"
      }
    });
    transport.emitMessage({
      id: 2,
      result: createFsReadFileResponse("aGVsbG8=") as JsonValue
    });
    await expect(readFile).resolves.toEqual(createFsReadFileResponse("aGVsbG8="));

    const writeFile = client.fs.writeFile({
      path: "/workspace/target.txt",
      dataBase64: "d29ybGQ="
    });
    await flushAsyncWork();
    expect(transport.sentMessages[1]).toEqual({
      id: 3,
      method: "fs/writeFile",
      params: {
        path: "/workspace/target.txt",
        dataBase64: "d29ybGQ="
      }
    });
    transport.emitMessage({
      id: 3,
      result: createEmptyFsResponse() as JsonValue
    });
    await expect(writeFile).resolves.toEqual(createEmptyFsResponse());

    const createDirectory = client.fs.createDirectory({
      path: "/workspace/nested",
      recursive: true
    });
    await flushAsyncWork();
    expect(transport.sentMessages[2]).toEqual({
      id: 4,
      method: "fs/createDirectory",
      params: {
        path: "/workspace/nested",
        recursive: true
      }
    });
    transport.emitMessage({
      id: 4,
      result: createEmptyFsResponse() as JsonValue
    });
    await expect(createDirectory).resolves.toEqual(createEmptyFsResponse());

    const getMetadata = client.fs.getMetadata({
      path: "/workspace/target.txt"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[3]).toEqual({
      id: 5,
      method: "fs/getMetadata",
      params: {
        path: "/workspace/target.txt"
      }
    });
    transport.emitMessage({
      id: 5,
      result: createFsGetMetadataResponse({
        isDirectory: false,
        isFile: true
      }) as JsonValue
    });
    await expect(getMetadata).resolves.toEqual(
      createFsGetMetadataResponse({
        isDirectory: false,
        isFile: true
      })
    );

    const readDirectory = client.fs.readDirectory({
      path: "/workspace"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[4]).toEqual({
      id: 6,
      method: "fs/readDirectory",
      params: {
        path: "/workspace"
      }
    });
    transport.emitMessage({
      id: 6,
      result: createFsReadDirectoryResponse([
        {
          fileName: "nested",
          isDirectory: true,
          isFile: false
        },
        {
          fileName: "target.txt",
          isDirectory: false,
          isFile: true
        }
      ]) as JsonValue
    });
    await expect(readDirectory).resolves.toEqual(
      createFsReadDirectoryResponse([
        {
          fileName: "nested",
          isDirectory: true,
          isFile: false
        },
        {
          fileName: "target.txt",
          isDirectory: false,
          isFile: true
        }
      ])
    );

    const remove = client.fs.remove({
      path: "/workspace/nested",
      recursive: true,
      force: true
    });
    await flushAsyncWork();
    expect(transport.sentMessages[5]).toEqual({
      id: 7,
      method: "fs/remove",
      params: {
        path: "/workspace/nested",
        recursive: true,
        force: true
      }
    });
    transport.emitMessage({
      id: 7,
      result: createEmptyFsResponse() as JsonValue
    });
    await expect(remove).resolves.toEqual(createEmptyFsResponse());

    const copy = client.fs.copy({
      sourcePath: "/workspace/source.txt",
      destinationPath: "/workspace/copied.txt",
      recursive: false
    });
    await flushAsyncWork();
    expect(transport.sentMessages[6]).toEqual({
      id: 8,
      method: "fs/copy",
      params: {
        sourcePath: "/workspace/source.txt",
        destinationPath: "/workspace/copied.txt",
        recursive: false
      }
    });
    transport.emitMessage({
      id: 8,
      result: createEmptyFsResponse() as JsonValue
    });
    await expect(copy).resolves.toEqual(createEmptyFsResponse());
  });

  it("routes account namespace helpers to the stable account RPC methods", async () => {
    const transport = new FakeTransport();
    const client = new AppServerClient({ transport });

    const initialize = client.initialize(createInitializeParams());
    await flushAsyncWork();
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: "codex",
        platformFamily: "unix",
        platformOs: "linux"
      }
    });
    await initialize;
    transport.sentMessages.length = 0;

    const accountRead = client.account.read();
    await flushAsyncWork();
    expect(transport.sentMessages[0]).toEqual({
      id: 2,
      method: "account/read",
      params: {
        refreshToken: false
      }
    });
    transport.emitMessage({
      id: 2,
      result: createGetAccountResponse() as JsonValue
    });
    await expect(accountRead).resolves.toEqual(createGetAccountResponse());

    const accountLoginStart = client.account.loginStart({
      type: "chatgpt"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[1]).toEqual({
      id: 3,
      method: "account/login/start",
      params: {
        type: "chatgpt"
      }
    });
    transport.emitMessage({
      id: 3,
      result: createLoginAccountResponse() as JsonValue
    });
    await expect(accountLoginStart).resolves.toEqual(createLoginAccountResponse());

    const accountLoginCancel = client.account.loginCancel({
      loginId: "login-1"
    });
    await flushAsyncWork();
    expect(transport.sentMessages[2]).toEqual({
      id: 4,
      method: "account/login/cancel",
      params: {
        loginId: "login-1"
      }
    });
    transport.emitMessage({
      id: 4,
      result: createCancelLoginAccountResponse() as JsonValue
    });
    await expect(accountLoginCancel).resolves.toEqual(
      createCancelLoginAccountResponse()
    );

    const accountLogout = client.account.logout();
    await flushAsyncWork();
    expect(transport.sentMessages[3]).toEqual({
      id: 5,
      method: "account/logout",
      params: undefined
    });
    transport.emitMessage({
      id: 5,
      result: createLogoutAccountResponse() as JsonValue
    });
    await expect(accountLogout).resolves.toEqual(createLogoutAccountResponse());

    const accountRateLimitsRead = client.account.rateLimitsRead();
    await flushAsyncWork();
    expect(transport.sentMessages[4]).toEqual({
      id: 6,
      method: "account/rateLimits/read",
      params: undefined
    });
    transport.emitMessage({
      id: 6,
      result: createAccountRateLimitsResponse() as JsonValue
    });
    await expect(accountRateLimitsRead).resolves.toEqual(
      createAccountRateLimitsResponse()
    );
  });
});

function createInitializeParams(): InitializeParams {
  return {
    clientInfo: {
      name: "codex-app-server-client-tests",
      title: null,
      version: "1.0.0"
    },
    capabilities: null
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createThreadStartResponse(thread: Thread): ThreadStartResponse {
  return {
    thread,
    model: "gpt-5",
    modelProvider: "openai",
    serviceTier: null,
    cwd: "/workspace",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: {
      type: "dangerFullAccess"
    },
    reasoningEffort: null
  };
}

function createThreadResumeResponse(thread: Thread): ThreadResumeResponse {
  return createThreadStartResponse(thread);
}

function createTurnStartResponse(turn: Turn): TurnStartResponse {
  return {
    turn
  };
}

function createTurnSteerResponse(turnId: string): TurnSteerResponse {
  return {
    turnId
  };
}

function createTurnInterruptResponse(): TurnInterruptResponse {
  return {};
}

function createCommandExecResponse(
  overrides: Partial<CommandExecResponse> = {}
): CommandExecResponse {
  return {
    exitCode: overrides.exitCode ?? 0,
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? ""
  };
}

function createEmptyCommandResponse():
  | CommandExecWriteResponse
  | CommandExecResizeResponse
  | CommandExecTerminateResponse {
  return {};
}

function createFsReadFileResponse(dataBase64: string): FsReadFileResponse {
  return {
    dataBase64
  };
}

function createGetAccountResponse(): GetAccountResponse {
  return {
    account: {
      type: "chatgpt",
      email: "teammate@example.com",
      planType: "plus"
    },
    requiresOpenaiAuth: false
  };
}

function createLoginAccountResponse(): LoginAccountResponse {
  return {
    type: "chatgpt",
    loginId: "login-1",
    authUrl: "https://example.com/auth"
  };
}

function createCancelLoginAccountResponse(): CancelLoginAccountResponse {
  return {
    status: "canceled"
  };
}

function createLogoutAccountResponse() {
  return {};
}

function createAccountRateLimitsResponse(): GetAccountRateLimitsResponse {
  const sharedSnapshot = {
    limitId: "codex",
    limitName: "Codex",
    primary: null,
    secondary: null,
    credits: null,
    planType: "plus"
  } as const;

  return {
    rateLimits: sharedSnapshot,
    rateLimitsByLimitId: {
      codex: sharedSnapshot
    }
  };
}

function createFsGetMetadataResponse(
  overrides: Partial<FsGetMetadataResponse> = {}
): FsGetMetadataResponse {
  return {
    isDirectory: overrides.isDirectory ?? false,
    isFile: overrides.isFile ?? true,
    createdAtMs: overrides.createdAtMs ?? 1,
    modifiedAtMs: overrides.modifiedAtMs ?? 2
  };
}

function createFsReadDirectoryResponse(
  entries: FsReadDirectoryResponse["entries"]
): FsReadDirectoryResponse {
  return {
    entries
  };
}

function createEmptyFsResponse():
  | FsCopyResponse
  | FsCreateDirectoryResponse
  | FsRemoveResponse
  | FsWriteFileResponse {
  return {};
}

function createThreadReadResponse(thread: Thread): ThreadReadResponse {
  return {
    thread
  };
}

function createTurn(
  turnId: string,
  status: Turn["status"],
  overrides: Partial<Turn> = {}
): Turn {
  return {
    id: turnId,
    items: [],
    status,
    error: null,
    ...overrides
  };
}

function createThread(
  threadId: string,
  overrides: Partial<Thread> = {}
): Thread {
  return {
    id: threadId,
    preview: "Demo thread",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 2,
    status: { type: "idle" },
    path: "/tmp/thread-1.jsonl",
    cwd: "/workspace",
    cliVersion: "1.0.0",
    source: "appServer",
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: "Demo thread",
    turns: [],
    ...overrides
  };
}
