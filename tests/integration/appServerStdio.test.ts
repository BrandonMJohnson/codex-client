import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

import { AppServerClient, StdioTransport } from "../../src/index.js";

const codexVersion = getCodexVersion();
const itIfCodex = codexVersion === null ? it.skip : it;

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

        const turnStart = await client.turn.start({
          threadId: threadStart.thread.id,
          input: [
            {
              type: "text",
              text: "Reply with exactly OK and nothing else.",
              text_elements: []
            }
          ]
        });

        await waitForTurnCompleted(
          client,
          threadStart.thread.id,
          turnStart.turn.id
        );

        const resumed = await client.thread.resume({
          threadId: threadStart.thread.id,
          persistExtendedHistory: false
        });

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
    30_000
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

async function waitForTurnCompleted(
  client: AppServerClient,
  threadId: string,
  turnId: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribeNotification();
      unsubscribeClose();
      reject(new Error(`Timed out waiting for turn ${turnId} to complete.`));
    }, 20_000);

    const unsubscribeNotification = client.onNotification((notification) => {
      if (notification.method !== "turn/completed") {
        return;
      }

      if (!isTurnCompletedNotification(notification.params, threadId, turnId)) {
        return;
      }

      clearTimeout(timeout);
      unsubscribeNotification();
      unsubscribeClose();
      resolve();
    });

    const unsubscribeClose = client.onClose((error) => {
      clearTimeout(timeout);
      unsubscribeNotification();
      unsubscribeClose();
      reject(error ?? new Error("Client closed before the turn completed."));
    });
  });
}

function isTurnCompletedNotification(
  params: unknown,
  threadId: string,
  turnId: string
): params is {
  threadId: string;
  turn: { id: string };
} {
  if (typeof params !== "object" || params === null) {
    return false;
  }

  const candidate = params as {
    threadId?: unknown;
    turn?: { id?: unknown };
  };

  return candidate.threadId === threadId && candidate.turn?.id === turnId;
}
