import { spawnSync } from "node:child_process";
import { join } from "node:path";

const codexCheck = spawnSync("codex", ["--version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

if (codexCheck.error) {
  console.error(
    `The codex CLI is required to run integration tests: ${codexCheck.error.message}`
  );
  process.exit(1);
}

if (codexCheck.status !== 0) {
  const stderr =
    typeof codexCheck.stderr === "string" ? codexCheck.stderr.trim() : "";
  const detail =
    stderr.length > 0
      ? stderr
      : "The codex CLI is required to run integration tests.";

  console.error(detail);
  process.exit(codexCheck.status ?? 1);
}

const vitestEntrypoint = join(
  process.cwd(),
  "node_modules",
  "vitest",
  "vitest.mjs"
);

const result = spawnSync(
  process.execPath,
  [vitestEntrypoint, "run", "tests/integration"],
  {
    stdio: "inherit"
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
