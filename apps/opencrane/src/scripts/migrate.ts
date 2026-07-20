import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { pathToFileURL } from "node:url";

import { ___CreateLogger } from "@opencrane/observability";

import type { DatabaseReadinessGate, MigrationCommandResult, MigrationCommandRunner } from "./migrate.types.js";

/** Structured logger for the migration init container — JSON to stdout for central scraping. */
const _log = ___CreateLogger("opencrane-ui-migrate");

/** Maximum wall-clock time spent waiting for PostgreSQL to accept TCP connections. */
const _DATABASE_READINESS_TIMEOUT_MS = 180_000;

/** Maximum duration of one database socket attempt. */
const _DATABASE_CONNECT_TIMEOUT_MS = 5_000;

/** Delay between failed database socket attempts. */
const _DATABASE_RETRY_DELAY_MS = 5_000;

/**
 * Pause without blocking the Node.js event loop.
 * @param durationMs - Milliseconds to wait.
 * @returns A promise that settles after the requested duration.
 */
function _sleep(durationMs: number): Promise<void>
{
  return new Promise(function _wait(resolve): void { setTimeout(resolve, durationMs); });
}

/**
 * Attempt one bounded TCP connection to PostgreSQL.
 * @param hostname - Database host parsed from `DATABASE_URL`.
 * @param port - Database port parsed from `DATABASE_URL`.
 * @param timeoutMs - Maximum duration of this socket attempt.
 * @returns A promise resolving true on connect and false on refusal, timeout, or DNS failure.
 */
function _tryDatabaseSocket(hostname: string, port: number, timeoutMs: number): Promise<boolean>
{
  return new Promise(function _connect(resolve): void
  {
    const socket = createConnection({ host: hostname, port });
    const timeout = setTimeout(function _connectionTimedOut(): void { socket.destroy(); resolve(false); }, timeoutMs);

    socket.once("connect", function _connected(): void
    {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", function _connectionFailed(): void
    {
      clearTimeout(timeout);
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for the CNPG Service endpoint to accept a TCP connection within one wall-clock deadline.
 * @param databaseUrl - PostgreSQL connection URL supplied to the migration container.
 * @param maximumWaitMs - Total availability window; injectable for focused tests.
 * @param retryDelayMs - Pause between attempts; injectable for focused tests.
 * @param connectTimeoutMs - Per-socket timeout; injectable for focused tests.
 * @returns A promise that settles once the database endpoint accepts a connection.
 */
export async function _WaitForDatabaseSocket(databaseUrl: string, maximumWaitMs = _DATABASE_READINESS_TIMEOUT_MS, retryDelayMs = _DATABASE_RETRY_DELAY_MS, connectTimeoutMs = _DATABASE_CONNECT_TIMEOUT_MS): Promise<void>
{
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
  {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  const port = parsed.port.length > 0 ? Number(parsed.port) : 5432;
  const hostname = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]") ? parsed.hostname.slice(1, -1) : parsed.hostname;
  const deadline = performance.now() + maximumWaitMs;

  while (performance.now() < deadline)
  {
    // 1. Bound each socket attempt by the remaining readiness window so DNS or routing failures
    //    cannot stretch the documented three-minute availability gate indefinitely.
    const remainingMs = deadline - performance.now();
    const connected = await _tryDatabaseSocket(hostname, port, Math.max(1, Math.min(connectTimeoutMs, remainingMs)));
    if (connected) return;

    // 2. Stop on the same monotonic deadline regardless of how long individual failures took.
    const waitRemainingMs = deadline - performance.now();
    if (waitRemainingMs <= 0) break;

    // 3. Retry only endpoint readiness; Prisma itself still runs exactly once after connectivity.
    await _sleep(Math.min(retryDelayMs, waitRemainingMs));
  }

  throw new Error(`database endpoint did not become reachable within ${maximumWaitMs}ms`);
}

/**
 * Run the immutable image's Prisma migration set from its package root.
 * @returns The completed synchronous child-process result.
 */
function _executeMigrations(): MigrationCommandResult
{
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    cwd: new URL("../../../../apps/opencrane/", import.meta.url).pathname,
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

/**
 * Wait for PostgreSQL availability, then apply the target schema exactly once.
 *
 * The readiness gate absorbs only the expected CNPG promotion interval. Once a socket is reachable,
 * every Prisma schema, permission, or migration-history failure terminates immediately.
 * @param waitForDatabase - Availability gate, injectable for focused tests.
 * @param runMigrations - Prisma command runner, injectable for focused tests.
 * @returns A promise that settles once the schema is current.
 */
export async function _RunMigrations(waitForDatabase: DatabaseReadinessGate = _WaitForDatabaseSocket, runMigrations: MigrationCommandRunner = _executeMigrations): Promise<void>
{
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required for database migrations");

  // 1. Wait only for the network endpoint so CNPG primary promotion is tolerated without parsing
  //    unstable Prisma CLI error strings or accidentally retrying an executable migration error.
  _log.info("waiting for database endpoint");
  await waitForDatabase(databaseUrl);

  // 2. Apply the greenfield schema once; any non-zero result remains an immediate deploy blocker.
  _log.info("running database migrations");
  const result = runMigrations();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0)
  {
    const termination = result.status === null && result.signal ? `signal ${result.signal}` : `status ${result.status ?? "unknown"}`;
    throw result.error ?? new Error(`prisma migrate deploy exited with ${termination}`);
  }

  _log.info("migrations complete");
}

/** True when Node invoked this bundled migration script directly. */
const _isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_isEntrypoint)
{
  _RunMigrations().catch(function _onMigrationFailure(err): void
  {
    _log.error({ err }, "migration failed");
    process.exitCode = 1;
  });
}
