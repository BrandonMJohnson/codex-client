import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createClient } from "../../src/index.js";

describe("createClient", () => {
  it("spawns, initializes, and closes a managed local app-server with zero transport wiring", async () => {
    const stderr = new PassThrough();
    const client = await createClient({
      command: process.execPath,
      args: ["-e", createFakeAppServerScript()],
      clientInfo: {
        version: "test-version"
      },
      stderr
    });

    try {
      expect(client.initializationState).toBe("initialized");

      const models = await client.modelList();
      expect(models).toEqual({
        data: [
          {
            id: "test-model",
            model: "test-model",
            displayName: "Test Model"
          }
        ],
        nextCursor: null
      });
    } finally {
      await client.close();
    }

    expect(client.process.exitCode).toBe(0);
  });

  it("rejects startup failures from the child process instead of surfacing an unhandled error", async () => {
    await expect(
      createClient({
        command: process.execPath,
        cwd: join(
          tmpdir(),
          `codex-client-missing-cwd-${process.pid}-${Date.now()}`
        ),
        stderr: new PassThrough()
      })
    ).rejects.toBeInstanceOf(Error);
  });

  it("validates closeTimeoutMs before spawning the managed child process", async () => {
    const markerPath = join(
      tmpdir(),
      `codex-client-create-marker-${process.pid}-${Date.now()}`
    );

    try {
      await expect(
        createClient({
          command: process.execPath,
          args: [
            "-e",
            `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "spawned")`
          ],
          closeTimeoutMs: -1,
          stderr: new PassThrough()
        })
      ).rejects.toBeInstanceOf(RangeError);

      expect(existsSync(markerPath)).toBe(false);
    } finally {
      await rm(markerPath, { force: true });
    }
  });
});

function createFakeAppServerScript(): string {
  return `
    const readline = require("node:readline");

    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity
    });

    function send(message) {
      process.stdout.write(JSON.stringify(message) + "\\n");
    }

    rl.on("line", (line) => {
      const message = JSON.parse(line);

      if (message.method === "initialize") {
        send({
          id: message.id,
          result: {
            userAgent: "test-codex",
            platformFamily: "unix",
            platformOs: "linux"
          }
        });
        return;
      }

      if (message.method === "model/list") {
        send({
          id: message.id,
          result: {
            data: [
              {
                id: "test-model",
                model: "test-model",
                displayName: "Test Model"
              }
            ],
            nextCursor: null
          }
        });
      }
    });

    process.stdin.on("end", () => {
      process.exit(0);
    });
  `;
}
