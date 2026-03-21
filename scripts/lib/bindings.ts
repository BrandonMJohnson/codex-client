import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type BindingFlavor = "stable" | "experimental";

export interface BindingTarget {
  readonly flavor: BindingFlavor;
  readonly experimental: boolean;
}

export interface GeneratedBindingsManifest {
  readonly schemaVersion: 1;
  readonly generator: {
    readonly name: "codex-cli";
    readonly version: string;
  };
  readonly artifacts: readonly {
    readonly flavor: BindingFlavor;
    readonly experimental: boolean;
    readonly typesDir: string;
    readonly schemaDir: string;
  }[];
}

export interface FileDifference {
  readonly path: string;
  readonly reason: "missing" | "unexpected" | "content-mismatch";
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, "../..");
export const generatedRoot = join(repoRoot, "src/generated");
export const schemasRoot = join(repoRoot, "schemas");
export const manifestPath = join(generatedRoot, "manifest.json");

export const bindingTargets: readonly BindingTarget[] = [
  { flavor: "stable", experimental: false },
  { flavor: "experimental", experimental: true },
];

export async function createBindingsTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "codex-app-server-client-bindings-"));
}

export async function getCodexVersion(): Promise<string> {
  const { stdout } = await execFileAsync("codex", ["--version"], {
    cwd: repoRoot,
  });

  return stdout.trim();
}

export async function generateArtifacts(rootDir: string): Promise<void> {
  const codexVersion = await getCodexVersion();

  for (const target of bindingTargets) {
    await generateTypeScriptBindings(rootDir, target);
    await generateJsonSchemas(rootDir, target);
  }

  await writeBindingsManifest(rootDir, codexVersion);
}

export async function replaceCommittedArtifacts(fromRoot: string): Promise<void> {
  await replaceDirectory(join(fromRoot, "src/generated"), generatedRoot);
  await replaceDirectory(join(fromRoot, "schemas"), schemasRoot);
}

export async function diffCommittedArtifacts(fromRoot: string): Promise<FileDifference[]> {
  const generatedDiffs = (await diffDirectory(
    join(fromRoot, "src/generated"),
    generatedRoot,
  )).map((difference) => ({
    ...difference,
    path: toPosixPath(join("src/generated", difference.path)),
  }));
  const schemaDiffs = (await diffDirectory(
    join(fromRoot, "schemas"),
    schemasRoot,
  )).map((difference) => ({
    ...difference,
    path: toPosixPath(join("schemas", difference.path)),
  }));

  return [...generatedDiffs, ...schemaDiffs].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

export function formatDifferences(differences: readonly FileDifference[]): string {
  return differences
    .map((difference) => `${difference.reason}: ${difference.path}`)
    .join("\n");
}

export function rewriteRelativeTsSpecifiers(
  source: string,
  options?: {
    readonly directorySpecifiers?: ReadonlySet<string>;
  },
): string {
  return source.replace(
    /(from\s+["'])([^"']+)(["'])/g,
    (match, prefix: string, specifier: string, suffix: string) => {
      const normalizedSpecifier = normalizeRelativeSpecifier(
        specifier,
        options?.directorySpecifiers,
      );

      if (normalizedSpecifier === specifier) {
        return match;
      }

      return `${prefix}${normalizedSpecifier}${suffix}`;
    },
  );
}

async function generateTypeScriptBindings(
  rootDir: string,
  target: BindingTarget,
): Promise<void> {
  const outputDir = join(rootDir, "src/generated", target.flavor);
  const args = ["app-server", "generate-ts", "--out", outputDir];

  if (target.experimental) {
    args.push("--experimental");
  }

  await execFileAsync("codex", args, { cwd: repoRoot });
  await normalizeGeneratedTypeScript(outputDir);
}

async function generateJsonSchemas(
  rootDir: string,
  target: BindingTarget,
): Promise<void> {
  const outputDir = join(rootDir, "schemas", target.flavor);
  const args = ["app-server", "generate-json-schema", "--out", outputDir];

  if (target.experimental) {
    args.push("--experimental");
  }

  await execFileAsync("codex", args, { cwd: repoRoot });
  await normalizeJsonDirectory(outputDir);
}

async function normalizeGeneratedTypeScript(directory: string): Promise<void> {
  const files = await listFiles(directory);

  await Promise.all(
    files
      .filter((filePath) => filePath.endsWith(".ts"))
      .map(async (filePath) => {
        const source = await readFile(filePath, "utf8");
        const normalizedSource = await rewriteRelativeTsSpecifiersForFile(
          filePath,
          source,
        );

        if (normalizedSource !== source) {
          await writeFile(filePath, normalizedSource);
        }
      }),
  );
}

async function normalizeJsonDirectory(directory: string): Promise<void> {
  const files = await listFiles(directory);

  await Promise.all(
    files
      .filter((filePath) => filePath.endsWith(".json"))
      .map(async (filePath) => {
        const source = await readFile(filePath, "utf8");
        const normalizedSource = `${stableStringifyJson(JSON.parse(source))}\n`;

        if (normalizedSource !== source) {
          await writeFile(filePath, normalizedSource);
        }
      }),
  );
}

async function writeBindingsManifest(
  rootDir: string,
  codexVersion: string,
): Promise<void> {
  const manifest: GeneratedBindingsManifest = {
    schemaVersion: 1,
    generator: {
      name: "codex-cli",
      version: codexVersion,
    },
    artifacts: bindingTargets.map((target) => ({
      flavor: target.flavor,
      experimental: target.experimental,
      typesDir: toPosixPath(join("src/generated", target.flavor)),
      schemaDir: toPosixPath(join("schemas", target.flavor)),
    })),
  };

  const outputPath = join(rootDir, "src/generated/manifest.json");
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function replaceDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  await rm(destinationDir, { recursive: true, force: true });
  await cp(sourceDir, destinationDir, { recursive: true });
}

async function diffDirectory(
  expectedDir: string,
  actualDir: string,
): Promise<FileDifference[]> {
  const expectedFiles = await listRelativeFiles(expectedDir);
  const actualFiles = await listRelativeFiles(actualDir);
  const differences: FileDifference[] = [];

  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);

  for (const relativePath of expectedFiles) {
    if (!actualSet.has(relativePath)) {
      differences.push({ path: relativePath, reason: "missing" });
      continue;
    }

    const [expectedContent, actualContent] = await Promise.all([
      readFile(join(expectedDir, relativePath)),
      readFile(join(actualDir, relativePath)),
    ]);

    if (!expectedContent.equals(actualContent)) {
      differences.push({ path: relativePath, reason: "content-mismatch" });
    }
  }

  for (const relativePath of actualFiles) {
    if (!expectedSet.has(relativePath)) {
      differences.push({ path: relativePath, reason: "unexpected" });
    }
  }

  return differences;
}

async function rewriteRelativeTsSpecifiersForFile(
  filePath: string,
  source: string,
): Promise<string> {
  const relativeSpecifiers = collectRelativeSpecifiers(source);
  const directorySpecifiers = new Set<string>();

  await Promise.all(
    relativeSpecifiers.map(async (specifier) => {
      const absolutePath = resolve(dirname(filePath), specifier);

      try {
        const resolvedStats = await stat(absolutePath);

        if (resolvedStats.isDirectory()) {
          directorySpecifiers.add(specifier);
        }
      } catch (error) {
        if (!isMissingPathError(error)) {
          throw error;
        }
      }
    }),
  );

  return rewriteRelativeTsSpecifiers(source, { directorySpecifiers });
}

async function listRelativeFiles(rootDir: string): Promise<string[]> {
  try {
    const files = await listFiles(rootDir);
    return files
      .map((filePath) => toPosixPath(relative(rootDir, filePath)))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

async function listFiles(rootDir: string): Promise<string[]> {
  const rootStats = await stat(rootDir);

  if (!rootStats.isDirectory()) {
    throw new Error(`Expected a directory at ${rootDir}`);
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectRelativeSpecifiers(source: string): string[] {
  const matches = source.matchAll(/from\s+["']([^"']+)["']/g);
  const specifiers = new Set<string>();

  for (const match of matches) {
    const [, specifier] = match;

    if (specifier !== undefined && specifier.startsWith(".")) {
      specifiers.add(specifier);
    }
  }

  return [...specifiers];
}

function normalizeRelativeSpecifier(
  specifier: string,
  directorySpecifiers?: ReadonlySet<string>,
): string {
  if (!specifier.startsWith(".")) {
    return specifier;
  }

  if (extname(specifier) !== "") {
    return specifier;
  }

  if (directorySpecifiers?.has(specifier)) {
    return `${specifier}/index.js`;
  }

  return `${specifier}.js`;
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function toPosixPath(filePath: string): string {
  return filePath.split("\\").join("/");
}

function stableStringifyJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }

  return value;
}
