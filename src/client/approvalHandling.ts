import type {
  ApplyPatchApprovalParams,
  ApplyPatchApprovalResponse,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  ExecCommandApprovalParams,
  ExecCommandApprovalResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  PermissionsRequestApprovalParams,
  PermissionsRequestApprovalResponse
} from "../protocol/index.js";
import type { RequestId } from "../protocol/index.js";

type ApprovalRequestMap = {
  readonly applyPatchApproval: {
    readonly params: ApplyPatchApprovalParams;
    readonly response: ApplyPatchApprovalResponse;
  };
  readonly execCommandApproval: {
    readonly params: ExecCommandApprovalParams;
    readonly response: ExecCommandApprovalResponse;
  };
  readonly "item/commandExecution/requestApproval": {
    readonly params: CommandExecutionRequestApprovalParams;
    readonly response: CommandExecutionRequestApprovalResponse;
  };
  readonly "item/fileChange/requestApproval": {
    readonly params: FileChangeRequestApprovalParams;
    readonly response: FileChangeRequestApprovalResponse;
  };
  readonly "item/permissions/requestApproval": {
    readonly params: PermissionsRequestApprovalParams;
    readonly response: PermissionsRequestApprovalResponse;
  };
};

export const APPROVAL_REQUEST_METHODS = [
  "applyPatchApproval",
  "execCommandApproval",
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval"
] as const;

export type AppServerClientApprovalRequestMethod =
  (typeof APPROVAL_REQUEST_METHODS)[number];

export type AppServerClientApprovalResponseOf<
  Method extends AppServerClientApprovalRequestMethod
> = ApprovalRequestMap[Method]["response"];

export type AppServerClientApprovalResponse =
  {
    [Method in AppServerClientApprovalRequestMethod]: AppServerClientApprovalResponseOf<Method>;
  }[AppServerClientApprovalRequestMethod];

export type AppServerClientApprovalRequestOf<
  Method extends AppServerClientApprovalRequestMethod
> = {
  readonly id: RequestId;
  readonly method: Method;
  readonly params: ApprovalRequestMap[Method]["params"];
};

export type AppServerClientApprovalRequest =
  {
    [Method in AppServerClientApprovalRequestMethod]: AppServerClientApprovalRequestOf<Method>;
  }[AppServerClientApprovalRequestMethod];

export type AppServerClientApprovalHandlers = Partial<{
  [Method in AppServerClientApprovalRequestMethod]: (
    request: AppServerClientApprovalRequestOf<Method>
  ) => AppServerClientApprovalResponseOf<Method> | Promise<AppServerClientApprovalResponseOf<Method>>;
}>;
