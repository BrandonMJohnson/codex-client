import { StringDecoder } from "node:string_decoder";
import type { Readable, Writable } from "node:stream";

import { ListenerSet } from "./listenerSet.js";
import {
  TransportError,
  TransportProtocolError,
  TransportStateError,
  type JsonValue,
  type Transport,
  type TransportCloseListener,
  type TransportErrorListener,
  type TransportMessageListener,
  type TransportState
} from "./transport.js";

export interface StdioTransportOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly closeOutputOnClose?: boolean;
}

export class StdioTransport implements Transport {
  readonly #closeListeners = new ListenerSet<TransportCloseListener>();
  readonly #decoder = new StringDecoder("utf8");
  readonly #errorListeners = new ListenerSet<TransportErrorListener>();
  readonly #messageListeners = new ListenerSet<TransportMessageListener>();
  readonly #options: Required<StdioTransportOptions>;

  #buffer = "";
  #receivedInputEnd = false;
  #state: TransportState = "idle";

  public constructor(options: StdioTransportOptions) {
    this.#options = {
      closeOutputOnClose: true,
      ...options
    };
  }

  public get state(): TransportState {
    return this.#state;
  }

  public async start(): Promise<void> {
    if (this.#state === "open") {
      return;
    }

    if (this.#state !== "idle") {
      throw new TransportStateError(
        `Cannot start transport while in "${this.#state}" state.`
      );
    }

    this.#options.input.on("data", this.#handleData);
    this.#options.input.on("end", this.#handleInputEnd);
    this.#options.input.on("close", this.#handleInputClose);
    this.#options.input.on("error", this.#handleInputError);
    this.#options.output.on("error", this.#handleOutputError);

    this.#state = "open";
  }

  public async send(message: JsonValue): Promise<void> {
    if (this.#state !== "open") {
      throw new TransportStateError(
        `Cannot send message while transport is "${this.#state}".`
      );
    }

    const frame = `${JSON.stringify(message)}\n`;

    await new Promise<void>((resolve, reject) => {
      this.#options.output.write(frame, "utf8", (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    if (this.#state === "closed") {
      return;
    }

    if (this.#state === "idle") {
      this.#finalizeClose();
      return;
    }

    this.#state = "closing";
    this.#detachStreamListeners();

    if (this.#options.closeOutputOnClose && !this.#options.output.destroyed) {
      await new Promise<void>((resolve) => {
        this.#options.output.end(() => {
          resolve();
        });
      });
    }

    this.#finalizeClose();
  }

  public onMessage(listener: TransportMessageListener): () => void {
    return this.#messageListeners.add(listener);
  }

  public onError(listener: TransportErrorListener): () => void {
    return this.#errorListeners.add(listener);
  }

  public onClose(listener: TransportCloseListener): () => void {
    return this.#closeListeners.add(listener);
  }

  readonly #handleData = (chunk: Buffer | string): void => {
    if (this.#state !== "open") {
      return;
    }

    const text =
      typeof chunk === "string" ? chunk : this.#decoder.write(chunk);

    this.#buffer += text;
    this.#drainBufferedFrames();
  };

  readonly #handleInputEnd = (): void => {
    this.#receivedInputEnd = true;

    const remainder = this.#decoder.end();
    if (remainder.length > 0) {
      this.#buffer += remainder;
    }

    if (this.#buffer.trim().length > 0) {
      this.#fail(
        new TransportProtocolError(
          "Input stream ended with an incomplete JSON frame."
        )
      );
      return;
    }

    this.#finalizeClose();
  };

  readonly #handleInputClose = (): void => {
    if (this.#state !== "open" || this.#receivedInputEnd) {
      this.#finalizeClose();
      return;
    }

    const remainder = this.#decoder.end();
    if (remainder.length > 0) {
      this.#buffer += remainder;
    }

    this.#fail(
      new TransportError("Input stream closed before ending cleanly.")
    );
  };

  readonly #handleInputError = (error: Error): void => {
    this.#fail(error);
  };

  readonly #handleOutputError = (error: Error): void => {
    this.#fail(error);
  };

  #drainBufferedFrames(): void {
    while (true) {
      const newlineIndex = this.#buffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const rawFrame = this.#buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.#buffer = this.#buffer.slice(newlineIndex + 1);

      if (rawFrame.trim().length === 0) {
        continue;
      }

      try {
        const message = JSON.parse(rawFrame) as JsonValue;
        this.#messageListeners.notify(message);
      } catch (cause) {
        this.#fail(
          new TransportProtocolError("Failed to parse newline-delimited JSON.", {
            cause
          })
        );
        return;
      }
    }
  }

  #fail(error: Error): void {
    if (this.#state === "closed") {
      return;
    }

    this.#errorListeners.notify(error);
    this.#finalizeClose(error);
  }

  #finalizeClose(error?: Error): void {
    if (this.#state === "closed") {
      return;
    }

    this.#detachStreamListeners();
    this.#buffer = "";
    this.#receivedInputEnd = false;
    this.#state = "closed";
    this.#closeListeners.notify(error);
  }

  #detachStreamListeners(): void {
    this.#options.input.off("data", this.#handleData);
    this.#options.input.off("end", this.#handleInputEnd);
    this.#options.input.off("close", this.#handleInputClose);
    this.#options.input.off("error", this.#handleInputError);
    this.#options.output.off("error", this.#handleOutputError);
  }
}
