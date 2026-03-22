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
