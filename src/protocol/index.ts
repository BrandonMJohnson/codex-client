/**
 * This module is the handwritten boundary around generated protocol bindings.
 * Runtime code should prefer these curated exports so regenerated files remain
 * isolated under `src/generated/`.
 */
export type {
  ClientInfo,
  ClientNotification,
  ClientRequest,
  InitializeCapabilities,
  InitializeParams,
  InitializeResponse,
  RequestId,
  ServerNotification,
  ServerRequest,
} from "../generated/stable/index.js";

export type {
  AppsListParams,
  AppsListResponse,
  CommandExecParams,
  CommandExecResponse,
  FsReadFileParams,
  FsReadFileResponse,
  FsWriteFileParams,
  FsWriteFileResponse,
  ModelListParams,
  ModelListResponse,
  SkillsListParams,
  SkillsListResponse,
  ThreadStartParams,
  ThreadStartResponse,
  TurnStartParams,
  TurnStartResponse,
} from "../generated/stable/v2/index.js";
