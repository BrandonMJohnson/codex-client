import { PassThrough } from "node:stream";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

import {
  StdioTransport,
  TransportProtocolError,
  TransportStateError,
  type JsonValue
} from "../../src/index.js";

async function collectOutput(stream: PassThrough): Promise<string> {
  const chunks: string[] = [];

  stream.on("data", (chunk: Buffer | string) => {
    chunks.push(chunk.toString());
  });

  await once(stream, "end");
  return chunks.join("");
}

describe("StdioTransport", () => {
  it("writes newline-delimited JSON frames", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioTransport({ input, output });

    await transport.start();

    const outputPromise = collectOutput(output);
    await transport.send({ method: "initialize", params: { cwd: "/tmp" } });
    await transport.close();

    await expect(outputPromise).resolves.toBe(
      '{"method":"initialize","params":{"cwd":"/tmp"}}\n'
    );
  });

  it("parses JSON frames across chunk boundaries", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioTransport({ input, output });
    const received: JsonValue[] = [];

    transport.onMessage((message) => {
      received.push(message);
    });

    await transport.start();

    input.write('{"id":1,"method":"initialize"}\n{"id":');
    input.end('2,"method":"initialized"}\n');

    await once(input, "close");

    expect(received).toEqual([
      { id: 1, method: "initialize" },
      { id: 2, method: "initialized" }
    ]);
    expect(transport.state).toBe("closed");
  });

  it("treats malformed frames as fatal protocol errors", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioTransport({ input, output });

    const errors: Error[] = [];
    const closeEvents: Array<Error | undefined> = [];

    transport.onError((error) => {
      errors.push(error);
    });
    transport.onClose((error) => {
      closeEvents.push(error);
    });

    await transport.start();
    input.write("{not-json}\n");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TransportProtocolError);
    expect(closeEvents).toHaveLength(1);
    expect(closeEvents[0]).toBe(errors[0]);
    expect(transport.state).toBe("closed");
  });

  it("rejects sends before the transport is started", async () => {
    const transport = new StdioTransport({
      input: new PassThrough(),
      output: new PassThrough()
    });

    await expect(transport.send({ ping: true })).rejects.toBeInstanceOf(
      TransportStateError
    );
  });

  it("fails if the input ends with a partial frame", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioTransport({ input, output });

    const errors: Error[] = [];
    transport.onError((error) => {
      errors.push(error);
    });

    await transport.start();
    input.end('{"id":1');

    await once(input, "close");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TransportProtocolError);
    expect(transport.state).toBe("closed");
  });
});
