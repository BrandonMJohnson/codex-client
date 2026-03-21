export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type TransportState = "idle" | "open" | "closing" | "closed";

export class TransportError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransportError";
  }
}

export class TransportProtocolError extends TransportError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransportProtocolError";
  }
}

export class TransportStateError extends TransportError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransportStateError";
  }
}

export type TransportMessageListener = (message: JsonValue) => void;
export type TransportErrorListener = (error: Error) => void;
export type TransportCloseListener = (error?: Error) => void;

export interface Transport {
  readonly state: TransportState;
  start(): Promise<void>;
  send(message: JsonValue): Promise<void>;
  close(): Promise<void>;
  onMessage(listener: TransportMessageListener): () => void;
  onError(listener: TransportErrorListener): () => void;
  onClose(listener: TransportCloseListener): () => void;
}
