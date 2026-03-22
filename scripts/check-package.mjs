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

    await writeConsumerPackageJson(consumerRoot);
    await installPackedTarball(consumerRoot, tarballPath);
    await assertPublishedEntrypointShape(consumerRoot);
    await assertPublishedModuleFormat(consumerRoot);
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

async function assertPublishedEntrypointShape(consumerRoot) {
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

  assertRootOnlyExports(installedPackageJson.exports);
  assertRootExportIsEsmOnly(installedPackageJson.exports["."]);

  if (installedPackageJson.main !== "./dist/index.js") {
    throw new Error(
      `Installed package main field drifted: ${installedPackageJson.main}`
    );
  }

  if (installedPackageJson.types !== "./dist/index.d.ts") {
    throw new Error(
      `Installed package types field drifted: ${installedPackageJson.types}`
    );
  }

  if (installedPackageJson.type !== "module") {
    throw new Error(
      `Installed package type field drifted: ${installedPackageJson.type}`
    );
  }
}

function assertRootOnlyExports(exportsField) {
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    throw new Error("Installed package is missing an exports map.");
  }

  const exportKeys = Object.keys(exportsField);
  if (exportKeys.length !== 1 || exportKeys[0] !== ".") {
    throw new Error(
      `Installed package unexpectedly exposes additional entrypoints: ${exportKeys.join(", ")}`
    );
  }

  const rootExport = exportsField["."];
  if (!rootExport || typeof rootExport !== "object" || Array.isArray(rootExport)) {
    throw new Error("Installed package root export is not an object map.");
  }
}

function assertRootExportIsEsmOnly(rootExport) {
  const exportKeys = Object.keys(rootExport).sort();
  if (exportKeys.length !== 2 || exportKeys[0] !== "import" || exportKeys[1] !== "types") {
    throw new Error(
      `Installed package root export is not ESM-only: ${exportKeys.join(", ")}`
    );
  }

  if (rootExport.import !== "./dist/index.js") {
    throw new Error(
      `Installed package root import drifted: ${rootExport.import}`
    );
  }

  if (rootExport.types !== "./dist/index.d.ts") {
    throw new Error(
      `Installed package root types drifted: ${rootExport.types}`
    );
  }
}

async function assertPublishedModuleFormat(consumerRoot) {
  await writeFile(
    join(consumerRoot, "esm-probe.mjs"),
    [
      'import { AppServerClient } from "codex-app-server-client";',
      "",
      'if (typeof AppServerClient !== "function") {',
      '  throw new Error("Expected the published package to resolve as an ES module.");',
      "}",
      ""
    ].join("\n")
  );

  await execFileAsync(process.execPath, ["esm-probe.mjs"], {
    cwd: consumerRoot
  });

  const cjsProbePath = join(consumerRoot, "require-probe.cjs");
  await writeFile(
    cjsProbePath,
    [
      "try {",
      '  require("codex-app-server-client");',
      "} catch (error) {",
      '  if (error && (error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || error.code === "ERR_REQUIRE_ESM")) {',
      '    process.exit(0);',
      "  }",
      "",
      "  console.error(error);",
      "  process.exit(1);",
      "}",
      "",
      'console.error("Expected require() to fail for an ESM-only package.");',
      "process.exit(1);",
      ""
    ].join("\n")
  );

  await execFileAsync(process.execPath, [cjsProbePath], {
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
      "",
      'await assertUnsupportedImport("codex-app-server-client/client");',
      'await assertUnsupportedImport("codex-app-server-client/rpc");',
      'await assertUnsupportedImport("codex-app-server-client/transport");',
      'await assertUnsupportedImport("codex-app-server-client/protocol");',
      "",
      "async function assertUnsupportedImport(specifier) {",
      "  try {",
      "    await import(specifier);",
      "  } catch (error) {",
      "    if (error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {",
      "      return;",
      "    }",
      "",
      "    throw new Error(",
      "      `Expected ${specifier} to fail with ERR_PACKAGE_PATH_NOT_EXPORTED, but got ${error?.code ?? error}`",
      "    );",
      "  }",
      "",
      "  throw new Error(`Expected ${specifier} to be unsupported.`);",
      "}",
      ""
    ].join("\n")
  );
}

async function runSmokeTest(consumerRoot) {
  await execFileAsync(process.execPath, ["smoke.mjs"], {
    cwd: consumerRoot
  });
}

await main();
