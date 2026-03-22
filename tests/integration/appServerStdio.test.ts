import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

import {
  AppServerClient,
  RpcResponseError,
  StdioTransport,
  type RpcNotificationMessage,
  type ThreadResumeResponse
} from "../../src/index.js";

const codexVersion = getCodexVersion();
const itIfCodex = codexVersion === null ? it.skip : it;

type CommandExecOutputDeltaNotification = {
  method: "command/exec/outputDelta";
  params: {
    processId: string;
    stream: "stdout" | "stderr";
    deltaBase64: string;
  };
};

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
      const turnNotifications: Array<{
        method: "turn/started" | "turn/completed";
        params: { threadId: string; turn: { id: string; status: string } };
      }> = [];

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
          if (
            notification.method === "turn/started" ||
            notification.method === "turn/completed"
          ) {
            turnNotifications.push(
              notification as (typeof turnNotifications)[number]
            );
          }
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
