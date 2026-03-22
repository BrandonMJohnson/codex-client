import { describe, expect, it } from "vitest";

import {
  AppServerClient,
  RpcResponseError,
  RpcStateError,
  type InitializeParams,
  type JsonValue,
  type RpcNotificationMessage,
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
