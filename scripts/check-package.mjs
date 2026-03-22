import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

async function main() {
  const tempRoot = await mkdtemp(
    join(tmpdir(), "codex-app-server-client-package-check-")
  );
  const consumerRoot = join(tempRoot, "consumer");

  let tarballPath;

  try {
    const packResult = await packRepository();
    tarballPath = packResult.tarballPath;

    assertPackedFile(packResult.files, "dist/index.js");
    assertPackedFile(packResult.files, "dist/index.d.ts");
    assertPackedFile(packResult.files, "README.md");
    assertPackedFile(packResult.files, "LICENSE");
    assertPackedFile(
      packResult.files,
      "schemas/stable/codex_app_server_protocol.schemas.json"
    );

    await writeConsumerPackageJson(consumerRoot);
    await installPackedTarball(consumerRoot, tarballPath);
    await writeSmokeTest(consumerRoot);
    await runSmokeTest(consumerRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });

    if (tarballPath) {
      await rm(tarballPath, { force: true });
    }
  }
}

async function packRepository() {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--json"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        npm_config_ignore_scripts: "false"
      }
    }
  );

  const [packMetadata] = JSON.parse(stdout);
  if (!packMetadata?.filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }

  return {
    tarballPath: resolve(repoRoot, packMetadata.filename),
    files: Array.isArray(packMetadata.files)
      ? packMetadata.files.map((entry) => entry.path)
      : []
  };
}

function assertPackedFile(files, expectedPath) {
  if (files.includes(expectedPath)) {
    return;
  }

  throw new Error(
    `Packed tarball is missing ${expectedPath}. Found files: ${files.join(", ")}`
  );
}

async function writeConsumerPackageJson(consumerRoot) {
  await mkdir(consumerRoot, { recursive: true });

  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "codex-app-server-client-package-check",
        private: true,
        type: "module"
      },
      null,
      2
    )}\n`
  );
}

async function installPackedTarball(consumerRoot, tarballPath) {
  await execFileAsync("npm", ["install", tarballPath], {
    cwd: consumerRoot
  });
}

async function writeSmokeTest(consumerRoot) {
  await writeFile(
    join(consumerRoot, "smoke.mjs"),
    [
      'import { AppServerClient, StdioTransport } from "codex-app-server-client";',
      "",
      'if (typeof AppServerClient !== "function") {',
      '  throw new Error("Expected AppServerClient export to be a constructor.");',
      "}",
      "",
      'if (typeof StdioTransport !== "function") {',
      '  throw new Error("Expected StdioTransport export to be a constructor.");',
      "}",
      ""
    ].join("\n")
  );

  const installedPackageJson = JSON.parse(
    await readFile(
      join(
        consumerRoot,
        "node_modules",
        "codex-app-server-client",
        "package.json"
      ),
      "utf8"
    )
  );

  if (installedPackageJson.main !== "./dist/index.js") {
    throw new Error(
      `Installed package main field drifted: ${installedPackageJson.main}`
    );
  }
}

async function runSmokeTest(consumerRoot) {
  await execFileAsync(process.execPath, ["smoke.mjs"], {
    cwd: consumerRoot
  });
}

await main();
