import { describe, expect, it } from "vitest";

import {
  RpcError,
  RpcProtocolError,
  RpcResponseError,
  RpcSession,
  RpcStateError,
  type JsonValue,
  type RpcErrorObject,
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

  public emitError(error: Error): void {
    for (const listener of this.#errorListeners) {
      listener(error);
    }
  }

  public emitClose(error?: Error): void {
    this.#state = "closed";
    this.#emitClose(error);
  }

  #emitClose(error?: Error): void {
    for (const listener of this.#closeListeners) {
      listener(error);
    }
  }
}

describe("RpcSession", () => {
  it("sends incrementing request ids and resolves matching responses", async () => {
    const transport = new FakeTransport();
    const session = new RpcSession({ transport });

    await session.start();

    const firstRequest = session.request("initialize", { cwd: "/tmp" });

    expect(transport.sentMessages).toEqual([
      { id: 1, method: "initialize", params: { cwd: "/tmp" } }
    ]);

    transport.emitMessage({ id: 1, result: { sessionId: "abc" } });

    await expect(firstRequest).resolves.toEqual({ sessionId: "abc" });
    expect(session.initializationState).toBe("initializeReady");

    await session.initialized();

    expect(transport.sentMessages).toEqual([
      { id: 1, method: "initialize", params: { cwd: "/tmp" } },
      { method: "initialized" }
    ]);
    expect(session.initializationState).toBe("initialized");

    const listModels = session.request("model/list");
    expect(transport.sentMessages[2]).toEqual({ id: 2, method: "model/list" });

    transport.emitMessage({ id: 2, result: ["gpt-5.4"] });
    await expect(listModels).resolves.toEqual(["gpt-5.4"]);
  });

  it("rejects non-initialize client calls before the handshake completes", async () => {
    const transport = new FakeTransport();
    const session = new RpcSession({ transport });

    await session.start();

    await expect(session.request("model/list")).rejects.toBeInstanceOf(
      RpcStateError
    );
    await expect(session.notify("thread/create")).rejects.toBeInstanceOf(
      RpcStateError
    );
    await expect(session.initialized()).rejects.toBeInstanceOf(RpcStateError);
  });

  it("rejects initialize errors, allows retrying, and blocks repeated initialize after success", async () => {
    const transport = new FakeTransport();
    const session = new RpcSession({ transport });

    await session.start();

    const initialize = session.request("initialize");
    transport.emitMessage({
      id: 1,
      error: {
        code: -32000,
        message: "bad init"
      } satisfies RpcErrorObject
    });

    await expect(initialize).rejects.toBeInstanceOf(RpcResponseError);
    expect(session.initializationState).toBe("preInitialize");

    const retry = session.request("initialize", { cwd: "/workspace" });
    expect(transport.sentMessages[1]).toEqual({
      id: 2,
      method: "initialize",
      params: { cwd: "/workspace" }
    });

    transport.emitMessage({ id: 2, result: null });
    await expect(retry).resolves.toBeNull();
    await session.initialized();

    await expect(session.request("initialize")).rejects.toBeInstanceOf(
      RpcStateError
    );
  });

  it("routes notifications and server-initiated requests separately", async () => {
    const transport = new FakeTransport();
    const session = new RpcSession({ transport });
    const notifications: RpcNotificationMessage[] = [];

    await session.start();

    const initialize = session.request("initialize");
    transport.emitMessage({ id: 1, result: null });
    await initialize;
    await session.initialized();
    transport.sentMessages.length = 0;

    session.onNotification((notification) => {
      notifications.push(notification);
    });

    const requests: string[] = [];
    session.onRequest((request) => {
      requests.push(request.method);
      void request.respond();
    });

    transport.emitMessage({ method: "turn/started", params: { id: "turn-1" } });
    transport.emitMessage({
      id: "req-1",
      method: "item/tool/call",
      params: { name: "shell.exec" }
    });

    expect(notifications).toEqual([
      { method: "turn/started", params: { id: "turn-1" } }
    ]);
    expect(requests).toEqual(["item/tool/call"]);
    expect(transport.sentMessages).toEqual([
      {
        id: "req-1",
        result: null
      }
    ]);
  });

  it("rejects pending requests with the protocol error that closed the session", async () => {
    const transport = new FakeTransport();
    const session = new RpcSession({ transport });
    const errors: Error[] = [];
    const closeEvents: Array<Error | undefined> = [];

    session.onError((error) => {
      errors.push(error);
    });
    session.onClose((error) => {
      closeEvents.push(error);
    });

    await session.start();
    const pendingInitialize = session.request("initialize");
    transport.emitMessage({ id: 99, result: null });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RpcProtocolError);
    await expect(pendingInitialize).rejects.toBe(errors[0]);
    expect(transport.state).toBe("closed");
    expect(session.initializationState).toBe("closed");
    expect(closeEvents).toEqual([errors[0]]);
  });

  it("rejects pending requests when the transport closes", async () => {
    const transport = new FakeTransport();
    const session = new RpcSession({ transport });

    await session.start();

    const pendingInitialize = session.request("initialize");
    transport.emitClose();

    await expect(pendingInitialize).rejects.toBeInstanceOf(RpcError);
    expect(session.initializationState).toBe("closed");
  });

  it("forwards transport errors to session listeners", async () => {
    const transport = new FakeTransport();
    const session = new RpcSession({ transport });
    const errors: Error[] = [];

    session.onError((error) => {
      errors.push(error);
    });

    await session.start();

    const transportError = new Error("boom");
    transport.emitError(transportError);

    expect(errors).toEqual([transportError]);
  });
});
