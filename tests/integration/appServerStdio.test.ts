import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AppServerClient,
  RpcResponseError,
  StdioTransport,
  type AppServerClientNotificationOf,
  type RpcNotificationMessage,
  type ThreadResumeResponse
} from "../../src/index.js";

const codexVersion = getCodexVersion();
const itIfCodex = codexVersion === null ? it.skip : it;
// Logging out mutates the caller's local Codex auth state, so keep that
// end-to-end check opt-in for intentional manual coverage.
const allowLiveLogoutTest =
  process.env.CODEX_CLIENT_ALLOW_LIVE_LOGOUT_TEST === "1";
const itIfCodexAndLiveLogout =
  codexVersion === null || !allowLiveLogoutTest ? it.skip : it;

type CommandExecOutputDeltaNotification = {
  method: "command/exec/outputDelta";
  params: {
    processId: string;
    stream: "stdout" | "stderr";
    deltaBase64: string;
  };
};

type StreamedTurnNotification =
  | AppServerClientNotificationOf<"turn/started">
  | AppServerClientNotificationOf<"item/started">
  | AppServerClientNotificationOf<"item/agentMessage/delta">
  | AppServerClientNotificationOf<"item/completed">
  | AppServerClientNotificationOf<"turn/completed">;

describe("codex app-server stdio integration", () => {
  itIfCodex(
    "completes initialize and model/list against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        const initializeResult = await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });

        expect(initializeResult).toEqual(
          expect.objectContaining({
            userAgent: expect.any(String),
            platformFamily: expect.any(String),
            platformOs: expect.any(String)
          })
        );

        const modelList = await client.modelList();
        expect(modelList).toEqual(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                model: expect.any(String),
                displayName: expect.any(String)
              })
            ])
          })
        );

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodex(
    "reads account state and rate limits against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });

        const account = await client.account.read();
        expect(account).toEqual(
          expect.objectContaining({
            requiresOpenaiAuth: expect.any(Boolean)
          })
        );

        if (account.account !== null) {
          expect(account.account.type === "apiKey" || account.account.type === "chatgpt").toBe(
            true
          );

          if (account.account.type === "chatgpt") {
            expect(account.account).toEqual(
              expect.objectContaining({
                email: expect.any(String),
                planType: expect.any(String)
              })
            );
          }
        }

        const rateLimits = await client.account.rateLimitsRead();
        expect(rateLimits.rateLimits).toHaveProperty("limitId");
        expect(rateLimits.rateLimits).toHaveProperty("limitName");
        expect(rateLimits.rateLimits).toHaveProperty("planType");

        if (rateLimits.rateLimitsByLimitId !== null) {
          expect(Object.keys(rateLimits.rateLimitsByLimitId).length).toBeGreaterThan(0);
        }

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodex(
    "starts and cancels a ChatGPT login flow against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });

        const loginStart = await client.account.loginStart({
          type: "chatgpt"
        });

        expect(loginStart).toEqual(
          expect.objectContaining({
            type: "chatgpt",
            loginId: expect.any(String),
            authUrl: expect.stringContaining("https://")
          })
        );

        if (loginStart.type !== "chatgpt") {
          throw new Error(
            `Expected chatgpt login flow response, received ${loginStart.type}.`
          );
        }

        const loginCancel = await client.account.loginCancel({
          loginId: loginStart.loginId
        });
        expect(loginCancel).toEqual({
          status: "canceled"
        });

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodexAndLiveLogout(
    "logs out the current account against a real app-server when CODEX_CLIENT_ALLOW_LIVE_LOGOUT_TEST=1",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });

        await expect(client.account.logout()).resolves.toEqual({});

        const account = await client.account.read();
        expect(account).toEqual(
          expect.objectContaining({
            account: null,
            requiresOpenaiAuth: expect.any(Boolean)
          })
        );

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodex(
    "starts a thread against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });

        const threadStart = await client.thread.start({
          cwd: process.cwd(),
          experimentalRawEvents: false,
          persistExtendedHistory: false
        });

        expect(threadStart).toEqual(
          expect.objectContaining({
            thread: expect.objectContaining({
              id: expect.any(String),
              cwd: process.cwd(),
              turns: expect.any(Array)
            }),
            model: expect.any(String),
            modelProvider: expect.any(String)
          })
        );

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodex(
    "resumes a thread after a completed turn persists rollout history",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });
        const modelList = await client.modelList({ includeHidden: true });
        const preferredModel = selectPreferredIntegrationModel(modelList.data);

        const threadStart = await client.thread.start({
          cwd: process.cwd(),
          ...(preferredModel ? { model: preferredModel } : {}),
          experimentalRawEvents: false,
          persistExtendedHistory: false
        });

        const turnStart = await client.turn.start({
          threadId: threadStart.thread.id,
          ...(preferredModel ? { model: preferredModel } : {}),
          effort: "low",
          input: [
            {
              type: "text",
              text: "Reply with the single word ok.",
              text_elements: []
            }
          ]
        });

        const resumed = await waitForCompletedThreadResume(
          client,
          threadStart.thread.id,
          turnStart.turn.id
        );

        expect(resumed.thread.id).toBe(threadStart.thread.id);
        expect(resumed.thread.turns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: turnStart.turn.id,
              status: "completed",
              items: expect.arrayContaining([
                expect.objectContaining({ type: "userMessage" }),
                expect.objectContaining({ type: "agentMessage" })
              ])
            })
          ])
        );

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    60_000
  );

  itIfCodex(
    "interrupts an active turn against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });
      const turnNotifications: Array<
        | AppServerClientNotificationOf<"turn/started">
        | AppServerClientNotificationOf<"turn/completed">
      > = [];

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });
        client.onEvent("turn/started", (notification) => {
          turnNotifications.push(notification);
        });
        client.onEvent("turn/completed", (notification) => {
          turnNotifications.push(notification);
        });

        const modelList = await client.modelList({ includeHidden: true });
        const preferredModel = selectPreferredIntegrationModel(modelList.data);
        const threadStart = await client.thread.start({
          cwd: process.cwd(),
          ...(preferredModel ? { model: preferredModel } : {}),
          experimentalRawEvents: false,
          persistExtendedHistory: false
        });

        const turnStart = await client.turn.start({
          threadId: threadStart.thread.id,
          ...(preferredModel ? { model: preferredModel } : {}),
          effort: "low",
          input: [
            {
              type: "text",
              text: "Print the word hello on separate lines 10000 times.",
              text_elements: []
            }
          ]
        });

        await expect(
          client.turn.interrupt({
            threadId: threadStart.thread.id,
            turnId: turnStart.turn.id
          })
        ).resolves.toEqual({});

        const completed = await waitForTurnNotification(
          turnNotifications,
          "turn/completed",
          turnStart.turn.id
        );

        expect(turnNotifications).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              method: "turn/started",
              params: expect.objectContaining({
                threadId: threadStart.thread.id,
                turn: expect.objectContaining({
                  id: turnStart.turn.id,
                  status: "inProgress"
                })
              })
            })
          ])
        );
        expect(completed).toEqual(
          expect.objectContaining({
            method: "turn/completed",
            params: expect.objectContaining({
              threadId: threadStart.thread.id,
              turn: expect.objectContaining({
                id: turnStart.turn.id,
                status: "interrupted"
              })
            })
          })
        );

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    30_000
  );

  itIfCodex(
    "streams item lifecycle notifications against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];
      const notifications: StreamedTurnNotification[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });
        client.onEvent("turn/started", (notification) => {
          notifications.push(notification);
        });
        client.onEvent("item/started", (notification) => {
          notifications.push(notification);
        });
        client.onEvent("item/agentMessage/delta", (notification) => {
          notifications.push(notification);
        });
        client.onEvent("item/completed", (notification) => {
          notifications.push(notification);
        });
        client.onEvent("turn/completed", (notification) => {
          notifications.push(notification);
        });

        const modelList = await client.modelList({ includeHidden: true });
        const preferredModel = selectPreferredIntegrationModel(modelList.data);
        const threadStart = await client.thread.start({
          cwd: process.cwd(),
          ...(preferredModel ? { model: preferredModel } : {}),
          experimentalRawEvents: false,
          persistExtendedHistory: false
        });

        const turnStart = await client.turn.start({
          threadId: threadStart.thread.id,
          ...(preferredModel ? { model: preferredModel } : {}),
          effort: "low",
          input: [
            {
              type: "text",
              text: "Reply with the exact text streaming-integration-check.",
              text_elements: []
            }
          ]
        });

        await waitForMatchingStreamNotification(
          notifications,
          (notification): notification is AppServerClientNotificationOf<"turn/completed"> =>
            notification.method === "turn/completed" &&
            notification.params.turn.id === turnStart.turn.id,
          `turn/completed notification for turn ${turnStart.turn.id}`
        );

        const completedAgentMessage = await waitForMatchingStreamNotification(
          notifications,
          (notification): notification is AppServerClientNotificationOf<"item/completed"> =>
            notification.method === "item/completed" &&
            notification.params.turnId === turnStart.turn.id &&
            notification.params.item.type === "agentMessage",
          `completed agentMessage item for turn ${turnStart.turn.id}`
        );

        if (completedAgentMessage.params.item.type !== "agentMessage") {
          throw new Error("Expected the completed item notification to be an agentMessage.");
        }

        const agentMessageItemId = completedAgentMessage.params.item.id;
        const itemStartedIndex = notifications.findIndex(
          (notification) =>
            notification.method === "item/started" &&
            notification.params.turnId === turnStart.turn.id &&
            notification.params.item.id === agentMessageItemId
        );
        const itemCompletedIndex = notifications.findIndex(
          (notification) =>
            notification.method === "item/completed" &&
            notification.params.turnId === turnStart.turn.id &&
            notification.params.item.id === agentMessageItemId
        );
        const deltaIndexes = notifications.flatMap((notification, index) => {
          if (
            notification.method !== "item/agentMessage/delta" ||
            notification.params.turnId !== turnStart.turn.id ||
            notification.params.itemId !== agentMessageItemId
          ) {
            return [];
          }

          return [index];
        });
        const turnCompletedIndex = notifications.findIndex(
          (notification) =>
            notification.method === "turn/completed" &&
            notification.params.turn.id === turnStart.turn.id
        );
        const streamedAgentText = collectAgentMessageDeltaText(
          notifications,
          agentMessageItemId
        );

        expect(itemStartedIndex).toBeGreaterThanOrEqual(0);
        expect(itemCompletedIndex).toBeGreaterThan(itemStartedIndex);
        expect(deltaIndexes.length).toBeGreaterThan(0);
        expect(deltaIndexes.every((index) => index > itemStartedIndex)).toBe(true);
        expect(deltaIndexes.every((index) => index < itemCompletedIndex)).toBe(true);
        expect(turnCompletedIndex).toBeGreaterThan(itemCompletedIndex);
        expect(normalizeNotificationText(streamedAgentText).length).toBeGreaterThan(0);
        expect(
          normalizeNotificationText(completedAgentMessage.params.item.text)
        ).toContain(normalizeNotificationText(streamedAgentText));

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    60_000
  );

  itIfCodex(
    "suppresses opted-out turn and delta notifications against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];
      const rawMethods: string[] = [];
      const itemStartedNotifications: Array<AppServerClientNotificationOf<"item/started">> =
        [];
      const itemCompletedNotifications: Array<AppServerClientNotificationOf<"item/completed">> =
        [];
      const turnCompletedNotifications: Array<AppServerClientNotificationOf<"turn/completed">> =
        [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: {
            experimentalApi: false,
            optOutNotificationMethods: [
              "turn/started",
              "item/agentMessage/delta"
            ]
          }
        });
        client.onNotification((notification) => {
          rawMethods.push(notification.method);
        });
        client.onEvent("item/started", (notification) => {
          itemStartedNotifications.push(notification);
        });
        client.onEvent("item/completed", (notification) => {
          itemCompletedNotifications.push(notification);
        });
        client.onEvent("turn/completed", (notification) => {
          turnCompletedNotifications.push(notification);
        });

        const modelList = await client.modelList({ includeHidden: true });
        const preferredModel = selectPreferredIntegrationModel(modelList.data);
        const threadStart = await client.thread.start({
          cwd: process.cwd(),
          ...(preferredModel ? { model: preferredModel } : {}),
          experimentalRawEvents: false,
          persistExtendedHistory: false
        });

        const turnStart = await client.turn.start({
          threadId: threadStart.thread.id,
          ...(preferredModel ? { model: preferredModel } : {}),
          effort: "low",
          input: [
            {
              type: "text",
              text: "Reply with the exact text opt-out-check.",
              text_elements: []
            }
          ]
        });

        await waitForMatchingTurnCompletedNotification(
          turnCompletedNotifications,
          (notification): notification is AppServerClientNotificationOf<"turn/completed"> =>
            notification.method === "turn/completed" &&
            notification.params.turn.id === turnStart.turn.id,
          `turn/completed notification for opted-out turn ${turnStart.turn.id}`
        );

        expect(
          rawMethods.includes("turn/started")
        ).toBe(false);
        expect(
          rawMethods.includes("item/agentMessage/delta")
        ).toBe(false);
        expect(
          itemStartedNotifications.some(
            (notification) =>
              notification.params.turnId === turnStart.turn.id
          )
        ).toBe(true);
        expect(
          itemCompletedNotifications.some(
            (notification) =>
              notification.params.turnId === turnStart.turn.id
          )
        ).toBe(true);
        expect(
          turnCompletedNotifications.some(
            (notification) =>
              notification.params.turn.id === turnStart.turn.id
          )
        ).toBe(true);

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    60_000
  );

  itIfCodex(
    "receives a live approval request when a turn asks to require approval",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];
      const resolvedNotifications: Array<
        AppServerClientNotificationOf<"serverRequest/resolved">
      > = [];
      const turnNotifications: Array<
        | AppServerClientNotificationOf<"turn/started">
        | AppServerClientNotificationOf<"turn/completed">
      > = [];
      let settleApprovalRequest:
        | ((
            value: {
              requestId: string | number;
              method:
                | "applyPatchApproval"
                | "execCommandApproval"
                | "item/commandExecution/requestApproval"
                | "item/fileChange/requestApproval"
                | "item/permissions/requestApproval";
              params: Record<string, unknown>;
            }
          ) => void)
        | undefined;
      const approvalRequest = new Promise<{
        requestId: string | number;
        method:
          | "applyPatchApproval"
          | "execCommandApproval"
          | "item/commandExecution/requestApproval"
          | "item/fileChange/requestApproval"
          | "item/permissions/requestApproval";
        params: Record<string, unknown>;
      }>((resolve) => {
        settleApprovalRequest = resolve;
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });
        client.onEvent("turn/started", (notification) => {
          turnNotifications.push(notification);
        });
        client.onEvent("turn/completed", (notification) => {
          turnNotifications.push(notification);
        });
        client.onEvent("serverRequest/resolved", (notification) => {
          resolvedNotifications.push(notification);
        });

        const stopHandlers = [
          client.handleRequest("applyPatchApproval", async (request) => {
            settleApprovalRequest?.({
              requestId: request.id,
              method: request.method,
              params: request.params as Record<string, unknown>
            });
            settleApprovalRequest = undefined;
            return {
              decision: "denied"
            };
          }),
          client.handleRequest("execCommandApproval", async (request) => {
            settleApprovalRequest?.({
              requestId: request.id,
              method: request.method,
              params: request.params as Record<string, unknown>
            });
            settleApprovalRequest = undefined;
            return {
              decision: "denied"
            };
          }),
          client.handleRequest(
            "item/commandExecution/requestApproval",
            async (request) => {
              settleApprovalRequest?.({
                requestId: request.id,
                method: request.method,
                params: request.params as Record<string, unknown>
              });
              settleApprovalRequest = undefined;
              return {
                decision: "decline"
              };
            }
          ),
          client.handleRequest("item/fileChange/requestApproval", async (request) => {
            settleApprovalRequest?.({
              requestId: request.id,
              method: request.method,
              params: request.params as Record<string, unknown>
            });
            settleApprovalRequest = undefined;
            return {
              decision: "decline"
            };
          }),
          client.handleRequest(
            "item/permissions/requestApproval",
            async (request) => {
              settleApprovalRequest?.({
                requestId: request.id,
                method: request.method,
                params: request.params as Record<string, unknown>
              });
              settleApprovalRequest = undefined;
            return {
              permissions: {},
              scope: "turn"
            };
          })
        ];

        const modelList = await client.modelList({ includeHidden: true });
        const preferredModel = selectPreferredIntegrationModel(modelList.data);
        const threadStart = await client.thread.start({
          cwd: process.cwd(),
          ...(preferredModel ? { model: preferredModel } : {}),
          approvalPolicy: "on-request",
          approvalsReviewer: "user",
          experimentalRawEvents: false,
          persistExtendedHistory: false
        });

        const turnStart = await client.turn.start({
          threadId: threadStart.thread.id,
          ...(preferredModel ? { model: preferredModel } : {}),
          effort: "low",
          approvalPolicy: "on-request",
          input: [
            {
              type: "text",
              text: "Try to do something that will require my approval.",
              text_elements: []
            }
          ]
        });

        const request = await waitForApprovalRequest(approvalRequest);

        expect(request.method).toMatch(/Approval$|requestApproval$/);

        if ("threadId" in request.params) {
          expect(request.params.threadId).toBe(threadStart.thread.id);
        }

        if ("turnId" in request.params) {
          expect(request.params.turnId).toBe(turnStart.turn.id);
        }

        if (request.method === "applyPatchApproval") {
          expect(request.params.conversationId).toBe(threadStart.thread.id);
          expect(request.params.fileChanges).toEqual(expect.any(Object));
        }

        if (request.method === "execCommandApproval") {
          expect(request.params.conversationId).toBe(threadStart.thread.id);
          expect(request.params.command).toEqual(expect.any(Array));
          expect(request.params.cwd).toBe(process.cwd());
        }

        if (request.method === "item/commandExecution/requestApproval") {
          expect(request.params.command).toEqual(expect.any(String));
          expect(request.params.cwd).toBe(process.cwd());
          expect(request.params.availableDecisions).toEqual(
            expect.arrayContaining([expect.any(String)])
          );
        }

        const resolved = await waitForResolvedRequestNotification(
          resolvedNotifications,
          threadStart.thread.id,
          request.requestId
        );

        expect(resolved).toEqual({
          method: "serverRequest/resolved",
          params: {
            threadId: threadStart.thread.id,
            requestId: request.requestId
          }
        });
        await expect(
          waitForTurnNotification(
            turnNotifications,
            "turn/completed",
            turnStart.turn.id
          )
        ).resolves.toEqual(
          expect.objectContaining({
            method: "turn/completed",
            params: expect.objectContaining({
              threadId: threadStart.thread.id,
              turn: expect.objectContaining({
                id: turnStart.turn.id
              })
            })
          })
        );

        stopHandlers.forEach((stop) => {
          stop();
        });
        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    60_000
  );

  itIfCodex(
    "executes a standalone command against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });

        const commandResult = await client.command.exec({
          command: [
            process.execPath,
            "-e",
            'process.stdout.write("command-client-api\\n")'
          ],
          cwd: process.cwd()
        });

        expect(commandResult).toEqual({
          exitCode: 0,
          stdout: "command-client-api\n",
          stderr: ""
        });

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodex(
    "streams stdin and resizes a PTY-backed standalone command against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });
      const notifications: RpcNotificationMessage[] = [];
      const processId = "interactive-command-test";
      const streamedText = "hello from stdin";
      const initialSizeText = "initial:80x24";
      const resizedText = "resize:120x40";

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });
        client.onNotification((notification) => {
          notifications.push(notification);
        });

        const execPromise = client.command.exec({
          command: [
            process.execPath,
            "-e",
            [
              'process.stdin.setEncoding("utf8");',
              'process.stdout.write(`initial:${process.stdout.columns}x${process.stdout.rows}\\n`);',
              "process.stdout.on('resize', () => {",
              '  process.stdout.write(`resize:${process.stdout.columns}x${process.stdout.rows}\\n`);',
              "});",
              "process.stdin.on('data', (chunk) => process.stdout.write(chunk));",
              "process.stdin.on('end', () => process.exit(0));"
            ].join("")
          ],
          processId,
          tty: true,
          streamStdin: true,
          streamStdoutStderr: true,
          size: {
            rows: 24,
            cols: 80
          }
        });

        await waitForCommandOutput(notifications, processId, initialSizeText);

        await expect(
          client.command.resize({
            processId,
            size: {
              rows: 40,
              cols: 120
            }
          })
        ).resolves.toEqual({});
        await waitForCommandOutput(notifications, processId, resizedText);

        await expect(
          client.command.write({
            processId,
            deltaBase64: Buffer.from(`${streamedText}\n`, "utf8").toString(
              "base64"
            ),
            closeStdin: true
          })
        ).resolves.toEqual({});

        const commandResult = await execPromise;
        expect(commandResult).toEqual({
          exitCode: 0,
          stdout: "",
          stderr: ""
        });

        const stdoutText = collectCommandOutput(notifications, processId, "stdout");
        expect(stdoutText).toContain(initialSizeText);
        expect(stdoutText).toContain(resizedText);
        expect(stdoutText).toContain(streamedText);

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodex(
    "terminates a streaming standalone command against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });
      const notifications: RpcNotificationMessage[] = [];
      const processId = "terminate-command-test";

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });
        client.onNotification((notification) => {
          notifications.push(notification);
        });

        const execPromise = client.command.exec({
          command: [
            process.execPath,
            "-e",
            [
              'process.stdout.write("started\\n");',
              "setInterval(() => undefined, 1_000);"
            ].join("")
          ],
          processId,
          streamStdoutStderr: true
        });

        await waitForCommandOutput(notifications, processId, "started");

        await expect(
          client.command.terminate({
            processId
          })
        ).resolves.toEqual({});

        const commandResult = await execPromise;
        expect(commandResult).toEqual(
          expect.objectContaining({
            exitCode: expect.any(Number),
            stdout: "",
            stderr: ""
          })
        );

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
      }
    },
    20_000
  );

  itIfCodex(
    "executes fs helpers against a real app-server",
    async () => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stderrChunks: string[] = [];
      const tempRoot = await mkdtemp(
        join(tmpdir(), "codex-app-server-client-fs-")
      );
      const workspaceDir = join(tempRoot, "workspace", "nested");
      const sourceFile = join(workspaceDir, "source.txt");
      const copiedFile = join(workspaceDir, "copy.txt");
      const fileContents = "filesystem-client-api\n";
      const fileContentsBase64 = Buffer.from(fileContents, "utf8").toString(
        "base64"
      );

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrChunks.push(chunk);
      });

      const transport = new StdioTransport({
        input: child.stdout,
        output: child.stdin
      });
      const client = new AppServerClient({ transport });

      try {
        await client.initialize({
          clientInfo: {
            name: "codex-app-server-client-tests",
            title: null,
            version: codexVersion ?? "unknown"
          },
          capabilities: null
        });

        await expect(
          client.fs.createDirectory({
            path: workspaceDir,
            recursive: true
          })
        ).resolves.toEqual({});

        await expect(
          client.fs.getMetadata({
            path: workspaceDir
          })
        ).resolves.toEqual(
          expect.objectContaining({
            isDirectory: true,
            isFile: false,
            createdAtMs: expect.any(Number),
            modifiedAtMs: expect.any(Number)
          })
        );

        await expect(
          client.fs.writeFile({
            path: sourceFile,
            dataBase64: fileContentsBase64
          })
        ).resolves.toEqual({});

        await expect(
          client.fs.readFile({
            path: sourceFile
          })
        ).resolves.toEqual({
          dataBase64: fileContentsBase64
        });

        await expect(
          client.fs.copy({
            sourcePath: sourceFile,
            destinationPath: copiedFile
          })
        ).resolves.toEqual({});

        await expect(
          client.fs.getMetadata({
            path: copiedFile
          })
        ).resolves.toEqual(
          expect.objectContaining({
            isDirectory: false,
            isFile: true,
            createdAtMs: expect.any(Number),
            modifiedAtMs: expect.any(Number)
          })
        );

        await expect(
          client.fs.readDirectory({
            path: workspaceDir
          })
        ).resolves.toEqual({
          entries: expect.arrayContaining([
            {
              fileName: "copy.txt",
              isDirectory: false,
              isFile: true
            },
            {
              fileName: "source.txt",
              isDirectory: false,
              isFile: true
            }
          ])
        });

        await expect(
          client.fs.remove({
            path: copiedFile,
            force: true
          })
        ).resolves.toEqual({});

        await expect(
          client.fs.readDirectory({
            path: workspaceDir
          })
        ).resolves.toEqual({
          entries: [
            {
              fileName: "source.txt",
              isDirectory: false,
              isFile: true
            }
          ]
        });

        await expect(
          client.fs.remove({
            path: tempRoot,
            recursive: true,
            force: true
          })
        ).resolves.toEqual({});

        await client.close();
        await waitForExit(child);
      } finally {
        await cleanupChild(child);
        await rm(tempRoot, {
          recursive: true,
          force: true
        });
      }
    },
    20_000
  );
});

function getCodexVersion(): string | null {
  const result = spawnSync("codex", ["--version"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  const output = result.stdout.trim();
  const match = /^codex-cli\s+(.+)$/.exec(output);
  return match?.[1] ?? output;
}

async function cleanupChild(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    await waitForExit(child).catch(() => undefined);
    return;
  }

  child.kill("SIGTERM");

  try {
    await waitForExit(child);
  } catch {
    child.kill("SIGKILL");
    await waitForExit(child).catch(() => undefined);
  }
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await Promise.race([
    once(child, "exit").then(() => undefined),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Timed out waiting for codex app-server to exit."));
      }, 5_000);
    })
  ]);
}

async function waitForCompletedThreadResume(
  client: AppServerClient,
  threadId: string,
  turnId: string
): Promise<ThreadResumeResponse> {
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    try {
      const resumed = await client.thread.resume({
        threadId,
        persistExtendedHistory: false
      });

      const resumedTurn = resumed.thread.turns.find((turn) => turn.id === turnId);
      if (
        resumedTurn?.status === "completed" &&
        resumedTurn.items.some((item) => item.type === "agentMessage")
      ) {
        return resumed;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
      continue;
    } catch (error) {
      if (
        error instanceof RpcResponseError &&
        error.code === -32600 &&
        error.message.includes("no rollout found")
      ) {
        await new Promise((resolve) => {
          setTimeout(resolve, 250);
        });
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Timed out waiting for thread ${threadId} to resume with completed turn ${turnId}.`
  );
}

async function waitForApprovalRequest(
  request: Promise<{
    requestId: string | number;
    method:
      | "applyPatchApproval"
      | "execCommandApproval"
      | "item/commandExecution/requestApproval"
      | "item/fileChange/requestApproval"
      | "item/permissions/requestApproval";
    params: Record<string, unknown>;
  }>
): Promise<{
  requestId: string | number;
  method:
    | "applyPatchApproval"
    | "execCommandApproval"
    | "item/commandExecution/requestApproval"
    | "item/fileChange/requestApproval"
    | "item/permissions/requestApproval";
  params: Record<string, unknown>;
}> {
  return await Promise.race([
    request,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Timed out waiting for a live approval request."));
      }, 45_000);
    })
  ]);
}

async function waitForTurnNotification(
  notifications: Array<{
    method: "turn/started" | "turn/completed";
    params: { threadId: string; turn: { id: string; status: string } };
  }>,
  method: "turn/started" | "turn/completed",
  turnId: string
): Promise<(typeof notifications)[number]> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const match = notifications.find(
      (notification) =>
        notification.method === method && notification.params.turn.id === turnId
    );

    if (match) {
      return match;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(
    `Timed out waiting for ${method} notification for turn ${turnId}.`
  );
}

async function waitForResolvedRequestNotification(
  notifications: Array<AppServerClientNotificationOf<"serverRequest/resolved">>,
  threadId: string,
  requestId: string | number
): Promise<AppServerClientNotificationOf<"serverRequest/resolved">> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const match = notifications.find(
      (notification) =>
        notification.params.threadId === threadId &&
        notification.params.requestId === requestId
    );

    if (match) {
      return match;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(
    `Timed out waiting for serverRequest/resolved notification for request ${String(
      requestId
    )}.`
  );
}

async function waitForMatchingStreamNotification<T extends StreamedTurnNotification>(
  notifications: StreamedTurnNotification[],
  predicate: (notification: StreamedTurnNotification) => notification is T,
  description: string,
  timeoutMs = 15_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const match = notifications.find(predicate);

    if (match) {
      return match;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

async function waitForMatchingTurnCompletedNotification(
  notifications: Array<AppServerClientNotificationOf<"turn/completed">>,
  predicate: (
    notification: AppServerClientNotificationOf<"turn/completed">
  ) => boolean,
  description: string,
  timeoutMs = 15_000
): Promise<AppServerClientNotificationOf<"turn/completed">> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const match = notifications.find(predicate);

    if (match) {
      return match;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function selectPreferredIntegrationModel(
  models: Array<{ id: string; model: string }>
): string | undefined {
  const preferredModels = [
    "gpt-5.3-codex-spark",
    "gpt-5.4-mini",
    "gpt-5.1-codex-mini"
  ];

  for (const preferredModel of preferredModels) {
    const match = models.find(
      (candidate) =>
        candidate.id === preferredModel || candidate.model === preferredModel
    );

    if (match) {
      return match.model;
    }
  }

  return undefined;
}

function collectAgentMessageDeltaText(
  notifications: StreamedTurnNotification[],
  itemId: string
): string {
  return notifications
    .flatMap((notification) => {
      if (notification.method !== "item/agentMessage/delta") {
        return [];
      }

      if (notification.params.itemId !== itemId) {
        return [];
      }

      return [notification.params.delta];
    })
    .join("");
}

function normalizeNotificationText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function collectCommandOutput(
  notifications: RpcNotificationMessage[],
  processId: string,
  stream: "stdout" | "stderr"
): string {
  return notifications
    .flatMap((notification) => {
      if (!isCommandExecOutputDeltaNotification(notification)) {
        return [];
      }

      if (
        notification.params.processId !== processId ||
        notification.params.stream !== stream
      ) {
        return [];
      }

      return [Buffer.from(notification.params.deltaBase64, "base64").toString("utf8")];
    })
    .join("");
}

function isCommandExecOutputDeltaNotification(
  notification: RpcNotificationMessage
): notification is CommandExecOutputDeltaNotification {
  return notification.method === "command/exec/outputDelta";
}

async function waitForCommandOutput(
  notifications: RpcNotificationMessage[],
  processId: string,
  expectedText: string
): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (collectCommandOutput(notifications, processId, "stdout").includes(expectedText)) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(
    `Timed out waiting for command output containing ${JSON.stringify(expectedText)} for process ${processId}.`
  );
}
