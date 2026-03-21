import type { JsonValue } from "../transport/transport.js";

export type RpcId = number | string;

export interface RpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: JsonValue;
}

export interface RpcRequestMessage {
  readonly id: RpcId;
  readonly method: string;
  readonly params?: JsonValue;
}

export interface RpcNotificationMessage {
  readonly method: string;
  readonly params?: JsonValue;
}

export interface RpcSuccessResponseMessage {
  readonly id: RpcId;
  readonly result?: JsonValue;
}

export interface RpcErrorResponseMessage {
  readonly id: RpcId;
  readonly error: RpcErrorObject;
}

export type RpcResponseMessage =
  | RpcSuccessResponseMessage
  | RpcErrorResponseMessage;

export type RpcMessage =
  | RpcRequestMessage
  | RpcNotificationMessage
  | RpcResponseMessage;
