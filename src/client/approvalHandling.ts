import type {
  ApplyPatchApprovalParams,
  ApplyPatchApprovalResponse,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  ExecCommandApprovalParams,
  ExecCommandApprovalResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  McpServerElicitationRequestParams,
  McpServerElicitationRequestResponse,
  PermissionsRequestApprovalParams,
  PermissionsRequestApprovalResponse,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse
} from "../protocol/index.js";
import type { RequestId } from "../protocol/index.js";
import type { RpcErrorObject } from "../rpc/index.js";
import type { JsonValue } from "../transport/transport.js";

export type ApprovalRequestMap = {
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
  readonly "item/tool/requestUserInput": {
    readonly params: ToolRequestUserInputParams;
    readonly response: ToolRequestUserInputResponse;
  };
  readonly "mcpServer/elicitation/request": {
    readonly params: McpServerElicitationRequestParams;
    readonly response: McpServerElicitationRequestResponse;
  };
};

export const APPROVAL_REQUEST_METHODS = [
  "applyPatchApproval",
  "execCommandApproval",
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request"
] as const;

export type AppServerClientApprovalRequestMethod =
  (typeof APPROVAL_REQUEST_METHODS)[number];

export type AppServerClientApprovalResponseOf<
  Method extends AppServerClientApprovalRequestMethod
> = ApprovalRequestMap[Method]["response"];

export type AppServerClientApprovalResponse = {
  [Method in AppServerClientApprovalRequestMethod]: AppServerClientApprovalResponseOf<Method>;
}[AppServerClientApprovalRequestMethod];

export type AppServerClientApprovalRequestOf<
  Method extends AppServerClientApprovalRequestMethod
> = {
  readonly id: RequestId;
  readonly method: Method;
  readonly params: ApprovalRequestMap[Method]["params"];
};

export type AppServerClientApprovalRequest = {
  [Method in AppServerClientApprovalRequestMethod]: AppServerClientApprovalRequestOf<Method>;
}[AppServerClientApprovalRequestMethod];

export type AppServerClientApprovalHandlers = Partial<{
  [Method in AppServerClientApprovalRequestMethod]: (
    request: AppServerClientApprovalRequestOf<Method>
  ) =>
    | AppServerClientApprovalResponseOf<Method>
    | Promise<AppServerClientApprovalResponseOf<Method>>;
}>;

export type AppServerClientNormalizedApprovalKind =
  | "applyPatch"
  | "execCommand"
  | "commandExecution"
  | "fileChange"
  | "permissions"
  | "toolUserInput"
  | "mcpElicitation";

export interface AppServerClientApprovalOption {
  readonly value: string;
  readonly label: string;
  readonly description: string | null;
}

export interface AppServerClientApprovalQuestion {
  readonly id: string;
  readonly header: string | null;
  readonly prompt: string;
  readonly allowOther: boolean;
  readonly isSecret: boolean;
  readonly options: readonly AppServerClientApprovalOption[];
}

type NormalizedApprovalBase<
  Method extends AppServerClientApprovalRequestMethod,
  Kind extends AppServerClientNormalizedApprovalKind
> = {
    readonly id: RequestId;
    readonly method: Method;
    readonly kind: Kind;
    readonly threadId: string | null;
    readonly turnId: string | null;
    readonly itemId: string | null;
    readonly reason: string | null;
    readonly message: string | null;
    readonly questions: readonly AppServerClientApprovalQuestion[];
    readonly rawParams: ApprovalRequestMap[Method]["params"];
    approve(): AppServerClientApprovalResponseOf<Method>;
    deny(): AppServerClientApprovalResponseOf<Method>;
  };

type NormalizedApplyPatchApprovalRequest = NormalizedApprovalBase<
  "applyPatchApproval",
  "applyPatch"
>;
type NormalizedExecCommandApprovalRequest = NormalizedApprovalBase<
  "execCommandApproval",
  "execCommand"
> & {
  readonly command: readonly string[];
  readonly cwd: string;
};
type NormalizedCommandExecutionApprovalRequest =
  NormalizedApprovalBase<
    "item/commandExecution/requestApproval",
    "commandExecution"
  > & {
    readonly command: string | null;
    readonly cwd: string | null;
    readonly availableDecisions: readonly unknown[];
  };
type NormalizedFileChangeApprovalRequest =
  NormalizedApprovalBase<"item/fileChange/requestApproval", "fileChange">;
type NormalizedPermissionsApprovalRequest =
  NormalizedApprovalBase<
    "item/permissions/requestApproval",
    "permissions"
  > & {
    readonly requestedPermissions: PermissionsRequestApprovalParams["permissions"];
    allowRequestedPermissions(
      scope?: PermissionsRequestApprovalResponse["scope"]
    ): PermissionsRequestApprovalResponse;
  };
type NormalizedToolUserInputApprovalRequest =
  NormalizedApprovalBase<
    "item/tool/requestUserInput",
    "toolUserInput"
  > & {
    answerQuestions(
      answers: ToolRequestUserInputResponse["answers"]
    ): ToolRequestUserInputResponse;
  };
type NormalizedMcpElicitationApprovalRequest =
  NormalizedApprovalBase<
    "mcpServer/elicitation/request",
    "mcpElicitation"
  > & {
    readonly serverName: string;
    readonly mode: McpServerElicitationRequestParams["mode"];
    readonly requestedSchema:
      | Extract<McpServerElicitationRequestParams, { mode: "form" }>["requestedSchema"]
      | null;
    readonly url:
      | Extract<McpServerElicitationRequestParams, { mode: "url" }>["url"]
      | null;
    acceptElicitation(
      content?: JsonValue | null,
      meta?: JsonValue | null
    ): McpServerElicitationRequestResponse;
    cancel(): McpServerElicitationRequestResponse;
  };

export type AppServerClientNormalizedApprovalRequestOf<
  Method extends AppServerClientApprovalRequestMethod
> = Method extends "applyPatchApproval"
  ? NormalizedApplyPatchApprovalRequest
  : Method extends "execCommandApproval"
    ? NormalizedExecCommandApprovalRequest
    : Method extends "item/commandExecution/requestApproval"
      ? NormalizedCommandExecutionApprovalRequest
      : Method extends "item/fileChange/requestApproval"
        ? NormalizedFileChangeApprovalRequest
        : Method extends "item/permissions/requestApproval"
          ? NormalizedPermissionsApprovalRequest
          : Method extends "item/tool/requestUserInput"
            ? NormalizedToolUserInputApprovalRequest
            : Method extends "mcpServer/elicitation/request"
              ? NormalizedMcpElicitationApprovalRequest
              : never;

export type AppServerClientNormalizedApprovalRequest = {
  [Method in AppServerClientApprovalRequestMethod]: AppServerClientNormalizedApprovalRequestOf<Method>;
}[AppServerClientApprovalRequestMethod];

export type AppServerClientInboundApprovalRequestOf<
  Method extends AppServerClientApprovalRequestMethod
> = AppServerClientNormalizedApprovalRequestOf<Method> & {
  respond(result: AppServerClientApprovalResponseOf<Method>): Promise<void>;
  respondError(error: RpcErrorObject): Promise<void>;
};

export type AppServerClientInboundApprovalRequest = {
  [Method in AppServerClientApprovalRequestMethod]: AppServerClientInboundApprovalRequestOf<Method>;
}[AppServerClientApprovalRequestMethod];

export type AppServerClientApprovalHandler = (
  request: AppServerClientInboundApprovalRequest
) => AppServerClientApprovalResponse | Promise<AppServerClientApprovalResponse>;

export function createNormalizedApprovalRequest(
  request: AppServerClientApprovalRequest
): AppServerClientNormalizedApprovalRequest {
  switch (request.method) {
    case "applyPatchApproval":
      return {
        id: request.id,
        method: request.method,
        kind: "applyPatch",
        threadId: request.params.conversationId,
        turnId: null,
        itemId: null,
        reason: request.params.reason,
        message: request.params.reason,
        questions: [],
        rawParams: request.params,
        approve: () => ({ decision: "approved" }),
        deny: () => ({ decision: "denied" })
      };
    case "execCommandApproval":
      return {
        id: request.id,
        method: request.method,
        kind: "execCommand",
        threadId: request.params.conversationId,
        turnId: null,
        itemId: null,
        reason: request.params.reason,
        message: request.params.reason,
        questions: [],
        rawParams: request.params,
        command: request.params.command,
        cwd: request.params.cwd,
        approve: () => ({ decision: "approved" }),
        deny: () => ({ decision: "denied" })
      };
    case "item/commandExecution/requestApproval":
      return {
        id: request.id,
        method: request.method,
        kind: "commandExecution",
        threadId: request.params.threadId,
        turnId: request.params.turnId,
        itemId: request.params.itemId,
        reason: request.params.reason ?? null,
        message: request.params.reason ?? request.params.command ?? null,
        questions: [],
        rawParams: request.params,
        command: request.params.command ?? null,
        cwd: request.params.cwd ?? null,
        availableDecisions: request.params.availableDecisions ?? [],
        approve: () => ({ decision: "accept" }),
        deny: () => ({ decision: "decline" })
      };
    case "item/fileChange/requestApproval":
      return {
        id: request.id,
        method: request.method,
        kind: "fileChange",
        threadId: request.params.threadId,
        turnId: request.params.turnId,
        itemId: request.params.itemId,
        reason: request.params.reason ?? null,
        message: request.params.reason ?? null,
        questions: [],
        rawParams: request.params,
        approve: () => ({ decision: "accept" }),
        deny: () => ({ decision: "decline" })
      };
    case "item/permissions/requestApproval":
      return {
        id: request.id,
        method: request.method,
        kind: "permissions",
        threadId: request.params.threadId,
        turnId: request.params.turnId,
        itemId: request.params.itemId,
        reason: request.params.reason,
        message: request.params.reason,
        questions: [],
        rawParams: request.params,
        requestedPermissions: request.params.permissions,
        approve: () => buildPermissionsApprovalResponse(request.params.permissions, "turn"),
        deny: () => ({ permissions: {}, scope: "turn" }),
        allowRequestedPermissions: (scope = "turn") =>
          buildPermissionsApprovalResponse(request.params.permissions, scope)
      };
    case "item/tool/requestUserInput": {
      const questions = normalizeToolUserInputQuestions(request.params.questions);
      return {
        id: request.id,
        method: request.method,
        kind: "toolUserInput",
        threadId: request.params.threadId,
        turnId: request.params.turnId,
        itemId: request.params.itemId,
        reason: null,
        message: questions.map((question) => question.prompt).join("\n\n") || null,
        questions,
        rawParams: request.params,
        approve: () => buildToolUserInputResponse(questions, "approve"),
        deny: () => buildToolUserInputResponse(questions, "deny"),
        answerQuestions: (answers) => ({ answers })
      };
    }
    case "mcpServer/elicitation/request": {
      const questions = normalizeElicitationQuestions(request.params);
      return {
        id: request.id,
        method: request.method,
        kind: "mcpElicitation",
        threadId: request.params.threadId,
        turnId: request.params.turnId,
        itemId: null,
        reason: null,
        message: request.params.message,
        questions,
        rawParams: request.params,
        serverName: request.params.serverName,
        mode: request.params.mode,
        requestedSchema:
          request.params.mode === "form" ? request.params.requestedSchema : null,
        url: request.params.mode === "url" ? request.params.url : null,
        approve: () => buildAcceptedElicitationResponse(request.params),
        deny: () => ({
          action: "decline",
          content: null,
          _meta: null
        }),
        acceptElicitation: (content, meta = null) => ({
          action: "accept",
          content:
            content === undefined
              ? inferDefaultElicitationContent(request.params)
              : content,
          _meta: meta
        }),
        cancel: () => ({
          action: "cancel",
          content: null,
          _meta: null
        })
      };
    }
  }
}

export function isApprovalRequestMethod(
  method: string
): method is AppServerClientApprovalRequestMethod {
  return (APPROVAL_REQUEST_METHODS as readonly string[]).includes(method);
}

function normalizeToolUserInputQuestions(
  questions: ToolRequestUserInputParams["questions"]
): AppServerClientApprovalQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    header: question.header,
    prompt: question.question,
    allowOther: question.isOther,
    isSecret: question.isSecret,
    options: (question.options ?? []).map((option) => ({
      value: option.label,
      label: option.label,
      description: option.description
    }))
  }));
}

function normalizeElicitationQuestions(
  params: McpServerElicitationRequestParams
): AppServerClientApprovalQuestion[] {
  if (params.mode !== "form") {
    return [];
  }

  return [
    {
      id: "elicitation",
      header: params.serverName,
      prompt: params.message,
      allowOther: true,
      isSecret: false,
      options: []
    }
  ];
}

function buildPermissionsApprovalResponse(
  requestedPermissions: PermissionsRequestApprovalParams["permissions"],
  scope: PermissionsRequestApprovalResponse["scope"]
): PermissionsRequestApprovalResponse {
  const permissions: PermissionsRequestApprovalResponse["permissions"] = {};

  if (requestedPermissions.network !== null) {
    permissions.network = requestedPermissions.network;
  }

  if (requestedPermissions.fileSystem !== null) {
    permissions.fileSystem = requestedPermissions.fileSystem;
  }

  return {
    permissions,
    scope
  };
}

function buildToolUserInputResponse(
  questions: readonly AppServerClientApprovalQuestion[],
  mode: "approve" | "deny"
): ToolRequestUserInputResponse {
  return {
    answers: Object.fromEntries(
      questions.map((question) => [
        question.id,
        {
          answers: [selectQuestionOption(question, mode).value]
        }
      ])
    )
  };
}

function selectQuestionOption(
  question: AppServerClientApprovalQuestion,
  mode: "approve" | "deny"
): AppServerClientApprovalOption {
  const options = question.options;

  if (options.length === 0) {
    return {
      value: mode === "approve" ? "Accept" : "Decline",
      label: mode === "approve" ? "Accept" : "Decline",
      description: null
    };
  }

  const preferredPattern =
    mode === "approve"
      ? /accept|approve|allow|continue|recommended|yes|run/i
      : /decline|deny|cancel|reject|no|skip|stop/i;
  const fallbackPattern =
    mode === "approve"
      ? /decline|deny|cancel|reject|no|skip|stop/i
      : /accept|approve|allow|continue|recommended|yes|run/i;

  return (
    options.find(
      (option) =>
        preferredPattern.test(option.label) ||
        preferredPattern.test(option.description ?? "")
    ) ??
    options.find(
      (option) =>
        !fallbackPattern.test(option.label) &&
        !fallbackPattern.test(option.description ?? "")
    ) ??
    (mode === "approve" ? options[0] : options[options.length - 1])!
  );
}

function buildAcceptedElicitationResponse(
  params: McpServerElicitationRequestParams
): McpServerElicitationRequestResponse {
  return {
    action: "accept",
    content: inferDefaultElicitationContent(params),
    _meta: null
  };
}

function inferDefaultElicitationContent(
  params: McpServerElicitationRequestParams
): JsonValue | null {
  if (params.mode === "url") {
    return null;
  }

  return {};
}
