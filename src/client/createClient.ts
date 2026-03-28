import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import type { Readable, Writable } from "node:stream";

import type { RpcId } from "../rpc/index.js";
import type {
  ClientInfo,
  InitializeCapabilities
} from "../protocol/index.js";
import { StdioTransport } from "../transport/index.js";
import {
  AppServerClient,
  type AppServerClientRequestOptions
} from "./appServerClient.js";

const DEFAULT_APP_SERVER_ARGS = ["app-server", "--listen", "stdio://"] as const;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
const DEFAULT_CLIENT_INFO: ClientInfo = {
  name: "codex-app-server-client",
  title: "Codex App Server Client",
  version: "0.0.0"
};

type ManagedAppServerProcess = ChildProcessByStdio<
  Writable,
  Readable,
  Readable
>;

export interface CreateClientOptions {
  /**
   * Executable used to launch the local app-server. Defaults to `codex`.
   */
  readonly command?: string;
  /**
   * Arguments forwarded to the executable. Defaults to
   * `["app-server", "--listen", "stdio://"]`.
   */
  readonly args?: readonly string[];
  /**
   * Working directory used when spawning the local app-server process.
   * Defaults to `process.cwd()`.
   */
  readonly cwd?: string;
  /**
   * Environment variables used for the spawned child process.
   * Defaults to inheriting `process.env`.
   */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Partial client-info override for the initialize handshake.
   */
  readonly clientInfo?: Partial<ClientInfo>;
  /**
   * Capabilities sent during initialize. Defaults to `null`.
   */
  readonly capabilities?: InitializeCapabilities | null;
  /**
   * Optional request-id factory forwarded to the underlying RPC session.
   */
  readonly requestIdFactory?: () => RpcId;
  /**
   * Optional default timeout forwarded to the underlying RPC session.
   */
  readonly defaultRequestTimeoutMs?: number;
  /**
   * Optional request controls for the auto-initialize handshake.
   */
  readonly initializeRequest?: AppServerClientRequestOptions;
  /**
   * Where to forward child-process stderr. Defaults to `process.stderr`.
   */
  readonly stderr?: Writable;
  /**
   * Time to wait for the child process to exit cleanly before escalating
   * termination signals during `close()`.
   */
  readonly closeTimeoutMs?: number;
}

export class ManagedAppServerClient extends AppServerClient {
  readonly #child: ManagedAppServerProcess;
  readonly #closeTimeoutMs: number;
  readonly #detachStderr: (() => void) | undefined;

  #closed = false;

  public constructor(
    child: ManagedAppServerProcess,
    options: {
      readonly closeTimeoutMs: number;
      readonly defaultRequestTimeoutMs?: number;
      readonly detachStderr?: () => void;
      readonly requestIdFactory?: () => RpcId;
    }
  ) {
    super({
      transport: new StdioTransport({
        input: child.stdout,
        output: child.stdin
      }),
      ...(options.requestIdFactory === undefined
        ? {}
        : { requestIdFactory: options.requestIdFactory }),
      ...(options.defaultRequestTimeoutMs === undefined
        ? {}
        : { defaultRequestTimeoutMs: options.defaultRequestTimeoutMs })
    });

    this.#child = child;
    this.#closeTimeoutMs = options.closeTimeoutMs;
    this.#detachStderr = options.detachStderr;
  }

  public get process(): ManagedAppServerProcess {
    return this.#child;
  }

  public override async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;

    try {
      await super.close();
    } finally {
      this.#detachStderr?.();
      await ensureChildProcessExited(this.#child, this.#closeTimeoutMs);
    }
  }
}

export async function createClient(
  options: CreateClientOptions = {}
): Promise<ManagedAppServerClient> {
  const child = spawnManagedAppServer(options);
  const client = new ManagedAppServerClient(child.process, {
    closeTimeoutMs: normalizeCloseTimeoutMs(options.closeTimeoutMs),
    ...(options.defaultRequestTimeoutMs === undefined
      ? {}
      : { defaultRequestTimeoutMs: options.defaultRequestTimeoutMs }),
    ...(options.requestIdFactory === undefined
      ? {}
      : { requestIdFactory: options.requestIdFactory }),
    ...(child.detachStderr === undefined
      ? {}
      : { detachStderr: child.detachStderr })
  });

  try {
    await client.initialize(
      {
        clientInfo: {
          ...DEFAULT_CLIENT_INFO,
          ...options.clientInfo
        },
        capabilities: options.capabilities ?? null
      },
      options.initializeRequest === undefined
        ? {}
        : {
            request: options.initializeRequest
          }
    );
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

function normalizeCloseTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) {
    return DEFAULT_CLOSE_TIMEOUT_MS;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError(
      "closeTimeoutMs must be a finite number greater than or equal to 0."
    );
  }

  return timeoutMs;
}

function spawnManagedAppServer(
  options: CreateClientOptions
): {
  readonly process: ManagedAppServerProcess;
  readonly detachStderr?: () => void;
} {
  const child = spawn(options.command ?? "codex", [
    ...(options.args ?? DEFAULT_APP_SERVER_ARGS)
  ], {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  let detachStderr: (() => void) | undefined;
  const stderrTarget = options.stderr ?? process.stderr;

  if (stderrTarget !== undefined) {
    child.stderr.pipe(stderrTarget, { end: false });
    detachStderr = () => {
      child.stderr.unpipe(stderrTarget);
    };
  }

  return detachStderr === undefined
    ? {
        process: child
      }
    : {
        process: child,
        detachStderr
      };
}

async function ensureChildProcessExited(
  child: ManagedAppServerProcess,
  closeTimeoutMs: number
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (await waitForProcessExit(child, closeTimeoutMs)) {
    return;
  }

  child.kill("SIGTERM");
  if (await waitForProcessExit(child, closeTimeoutMs)) {
    return;
  }

  child.kill("SIGKILL");
  if (await waitForProcessExit(child, closeTimeoutMs)) {
    return;
  }

  await once(child, "exit");
}

async function waitForProcessExit(
  child: ManagedAppServerProcess,
  timeoutMs: number
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    const handle = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    handle.unref?.();

    const onExit = (): void => {
      cleanup();
      resolve(true);
    };

    const cleanup = (): void => {
      clearTimeout(handle);
      child.off("exit", onExit);
    };

    child.once("exit", onExit);
  });
}
