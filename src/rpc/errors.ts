import type { JsonValue } from "../transport/transport.js";

import type { RpcErrorObject, RpcId } from "./messages.js";

export class RpcError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RpcError";
  }
}

export class RpcProtocolError extends RpcError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RpcProtocolError";
  }
}

export class RpcStateError extends RpcError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RpcStateError";
  }
}

export class RpcResponseError extends RpcError {
  readonly code: number;
  readonly data: JsonValue | undefined;
  readonly id: RpcId;

  public constructor(id: RpcId, error: RpcErrorObject) {
    super(error.message);
    this.name = "RpcResponseError";
    this.code = error.code;
    this.data = error.data;
    this.id = id;
  }
}
