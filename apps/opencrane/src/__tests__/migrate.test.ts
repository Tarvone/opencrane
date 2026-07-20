import { createServer } from "node:net";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _RunMigrations, _WaitForDatabaseSocket } from "../scripts/migrate.js";
import type { MigrationCommandResult } from "../scripts/migrate.types.js";

/** Original database URL restored after every test. */
const _originalDatabaseUrl = process.env["DATABASE_URL"];

/** Availability gate that succeeds immediately in command-behaviour tests. */
async function _databaseReady(): Promise<void> {}

/** Successful Prisma command result used by the focused runner tests. */
function _successfulMigration(): MigrationCommandResult
{
  return { status: 0, signal: null, stdout: "schema current", stderr: "" };
}

describe("migration runner", function _migrationRunnerSuite()
{
  beforeEach(function _setDatabaseUrl()
  {
    process.env["DATABASE_URL"] = "postgresql://opencrane:secret@127.0.0.1:5432/opencrane";
  });

  afterEach(function _restoreDatabaseUrl()
  {
    if (_originalDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = _originalDatabaseUrl;
  });

  it("runs Prisma once after the database readiness gate succeeds", async function _runOnce()
  {
    let runs = 0;
    /** Count one successful migration execution. */
    function _runMigration(): MigrationCommandResult { runs += 1; return _successfulMigration(); }

    await _RunMigrations(_databaseReady, _runMigration);

    expect(runs).toBe(1);
  });

  it("fails immediately when Prisma reports a schema error", async function _rejectSchemaError()
  {
    let runs = 0;
    /** Return one executable migration failure. */
    function _runMigration(): MigrationCommandResult
    {
      runs += 1;
      return { status: 1, signal: null, stdout: "", stderr: "Error: P3009: failed migration" };
    }

    await expect(_RunMigrations(_databaseReady, _runMigration)).rejects.toThrow("prisma migrate deploy exited with status 1");
    expect(runs).toBe(1);
  });

  it("preserves the process-launch error when npx cannot start", async function _preserveLaunchError()
  {
    const launchError = new Error("spawn npx ENOENT");
    /** Return the Node.js process-launch failure shape. */
    function _runMigration(): MigrationCommandResult
    {
      return { status: null, signal: null, stdout: "", stderr: "", error: launchError };
    }

    await expect(_RunMigrations(_databaseReady, _runMigration)).rejects.toBe(launchError);
  });

  it("reports the terminating signal when Prisma is killed", async function _reportSignal()
  {
    /** Return the Node.js signal-termination result shape. */
    function _runMigration(): MigrationCommandResult
    {
      return { status: null, signal: "SIGKILL", stdout: "", stderr: "" };
    }

    await expect(_RunMigrations(_databaseReady, _runMigration)).rejects.toThrow("signal SIGKILL");
  });

  it("uses a real TCP endpoint instead of Prisma error text for readiness", async function _probeSocket()
  {
    const server = createServer();
    await new Promise<void>(function _listen(resolve): void { server.listen(0, "127.0.0.1", resolve); });
    const address = server.address() as AddressInfo;

    await _WaitForDatabaseSocket(`postgresql://opencrane:secret@127.0.0.1:${address.port}/opencrane`, 100, 1, 25);
    await new Promise<void>(function _close(resolve, reject): void { server.close(function _closed(err): void { if (err) reject(err); else resolve(); }); });
  });

  it("connects when DATABASE_URL uses a bracketed IPv6 literal", async function _probeIpv6Socket()
  {
    const server = createServer();
    await new Promise<void>(function _listen(resolve): void { server.listen(0, "::1", resolve); });
    const address = server.address() as AddressInfo;

    await _WaitForDatabaseSocket(`postgresql://opencrane:secret@[::1]:${address.port}/opencrane`, 100, 1, 25);
    await new Promise<void>(function _close(resolve, reject): void { server.close(function _closed(err): void { if (err) reject(err); else resolve(); }); });
  });

  it("enforces one wall-clock deadline for an unavailable endpoint", async function _boundReadiness()
  {
    const server = createServer();
    await new Promise<void>(function _listen(resolve): void { server.listen(0, "127.0.0.1", resolve); });
    const address = server.address() as AddressInfo;
    await new Promise<void>(function _close(resolve, reject): void { server.close(function _closed(err): void { if (err) reject(err); else resolve(); }); });

    const startedAt = performance.now();
    await expect(_WaitForDatabaseSocket(`postgresql://opencrane:secret@127.0.0.1:${address.port}/opencrane`, 25, 1, 5)).rejects.toThrow("within 25ms");

    expect(performance.now() - startedAt).toBeLessThan(250);
  });
});
