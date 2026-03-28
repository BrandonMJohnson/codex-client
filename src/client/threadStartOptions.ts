import type { ThreadStartParams } from "../protocol/index.js";

export interface AppServerClientThreadStartOptions
  extends Omit<
    ThreadStartParams,
    "experimentalRawEvents" | "persistExtendedHistory"
  > {
  /**
   * Defaults to `false` so callers do not have to opt out of internal raw-event
   * streaming unless they explicitly need it.
   */
  readonly experimentalRawEvents?: boolean;
  /**
   * Defaults to `false` because richer persisted rollout history is optional
   * and most callers only need a normal thread session.
   */
  readonly persistExtendedHistory?: boolean;
}

export function normalizeThreadStartParams(
  params: AppServerClientThreadStartOptions = {}
): ThreadStartParams {
  return {
    experimentalRawEvents: false,
    persistExtendedHistory: false,
    ...params
  };
}
