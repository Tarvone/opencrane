import type { PrismaClient } from "@prisma/client";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MembershipProjectionRepairer, _BuildHttpFleetMembershipReader } from "../../infra/membership-projection-repairer.js";
import type { FleetMembershipReader, FleetMembershipRow } from "../../infra/membership-projection-repairer.types.js";

const _log = pino({ enabled: false });

/** A local membership row (silo read-model). */
interface Row { clusterTenant: string; subject: string; role: string }

/**
 * Build a Prisma stub over an in-memory OrgMembership table. Implements the surface the
 * repairer touches: orgMembership.{findMany,upsert,delete}.
 */
function _mockPrisma(seed: Row[] = []): { prisma: PrismaClient; rows: Row[] }
{
  const rows: Row[] = seed.map(r => ({ ...r }));
  const prisma = {
    orgMembership: {
      findMany: vi.fn(async function _findMany(args: { where: { clusterTenant: string } })
      {
        return rows.filter(r => r.clusterTenant === args.where.clusterTenant).map(r => ({ subject: r.subject, role: r.role }));
      }),
      upsert: vi.fn(async function _upsert(args: { where: { clusterTenant_subject: { clusterTenant: string; subject: string } }; create: Row; update: { role: string } })
      {
        const { clusterTenant, subject } = args.where.clusterTenant_subject;
        const existing = rows.find(r => r.clusterTenant === clusterTenant && r.subject === subject);
        if (existing) { existing.role = args.update.role; return existing; }
        const created = { ...args.create }; rows.push(created); return created;
      }),
      delete: vi.fn(async function _delete(args: { where: { clusterTenant_subject: { clusterTenant: string; subject: string } } })
      {
        const { clusterTenant, subject } = args.where.clusterTenant_subject;
        const idx = rows.findIndex(r => r.clusterTenant === clusterTenant && r.subject === subject);
        if (idx >= 0) rows.splice(idx, 1);
        return {};
      }),
    },
  } as unknown as PrismaClient;
  return { prisma, rows };
}

/** A reader that returns a fixed set (or null to signal source-unavailable). */
function _fixedReader(result: FleetMembershipRow[] | null): FleetMembershipReader
{
  return { read: vi.fn(async function _read() { return result; }) };
}

/** Run one sweep by starting + stopping (an immediate sweep fires on start). */
async function _sweepOnce(repairer: MembershipProjectionRepairer): Promise<void>
{
  repairer.start();
  await new Promise(function _r(resolve) { setTimeout(resolve, 0); });
  repairer.stop();
}

describe("MembershipProjectionRepairer._reconcile", function _reconcileSuite()
{
  afterEach(function _reset() { vi.restoreAllMocks(); });

  it("creates local rows for members the fleet has that the silo lacks", async function _creates()
  {
    const { prisma, rows } = _mockPrisma([]);
    const reader = _fixedReader([{ subject: "user-2", role: "Member" }, { subject: "owner-1", role: "Owner" }]);
    await _sweepOnce(new MembershipProjectionRepairer(prisma, reader, "acme", _log, 60_000));

    expect(rows).toContainEqual({ clusterTenant: "acme", subject: "user-2", role: "Member" });
    expect(rows).toContainEqual({ clusterTenant: "acme", subject: "owner-1", role: "Owner" });
  });

  it("corrects a drifted role and removes members the fleet no longer lists", async function _driftsAndRemoves()
  {
    const { prisma, rows } = _mockPrisma([
      { clusterTenant: "acme", subject: "user-2", role: "Member" },
      { clusterTenant: "acme", subject: "stale", role: "Member" },
    ]);
    const reader = _fixedReader([{ subject: "user-2", role: "Admin" }]);
    await _sweepOnce(new MembershipProjectionRepairer(prisma, reader, "acme", _log, 60_000));

    expect(rows.find(r => r.subject === "user-2")?.role).toBe("Admin");
    expect(rows.find(r => r.subject === "stale")).toBeUndefined();
  });

  it("ignores fleet rows with an unrecognised role (never persists a bad role)", async function _badRole()
  {
    const { prisma, rows } = _mockPrisma([]);
    const reader = _fixedReader([{ subject: "user-2", role: "Superuser" }]);
    await _sweepOnce(new MembershipProjectionRepairer(prisma, reader, "acme", _log, 60_000));

    expect(rows).toHaveLength(0);
  });

  it("is a safe no-op when the reader returns null (source unavailable) — local rows survive", async function _nullNoOp()
  {
    const { prisma, rows } = _mockPrisma([{ clusterTenant: "acme", subject: "local-only", role: "Member" }]);
    const reader = _fixedReader(null);
    await _sweepOnce(new MembershipProjectionRepairer(prisma, reader, "acme", _log, 60_000));

    // A null read must NOT wipe locally-managed rows (the #151 standalone guarantee).
    expect(rows).toEqual([{ clusterTenant: "acme", subject: "local-only", role: "Member" }]);
  });

  it("does not sweep when disabled (interval <= 0)", async function _disabled()
  {
    const { prisma } = _mockPrisma([]);
    const reader = _fixedReader([{ subject: "x", role: "Member" }]);
    const repairer = new MembershipProjectionRepairer(prisma, reader, "acme", _log, 0);
    await _sweepOnce(repairer);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it("does not sweep when no cluster tenant is configured", async function _noOrg()
  {
    const { prisma } = _mockPrisma([]);
    const reader = _fixedReader([{ subject: "x", role: "Member" }]);
    const repairer = new MembershipProjectionRepairer(prisma, reader, "", _log, 60_000);
    await _sweepOnce(repairer);
    expect(reader.read).not.toHaveBeenCalled();
  });
});

describe("_BuildHttpFleetMembershipReader — standalone-safe fleet read (#126 S2)", function _readerSuite()
{
  it("returns null (no-op) when no fleet URL is configured (#151 standalone)", async function _standalone()
  {
    const reader = _BuildHttpFleetMembershipReader("", "", _log, (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch);
    await expect(reader.read("acme")).resolves.toBeNull();
  });

  it("returns the members array on a 200 response, with the bearer token attached", async function _ok()
  {
    let seenAuth: string | undefined;
    const fetchImpl = (async function _f(_url: string, init: { headers?: Record<string, string> }) {
      seenAuth = init?.headers?.authorization;
      return { ok: true, status: 200, json: async () => ({ clusterTenant: "acme", members: [{ subject: "u1", role: "Owner" }] }) };
    }) as unknown as typeof fetch;
    const reader = _BuildHttpFleetMembershipReader("http://fleet:8080", "svc-token", _log, fetchImpl);

    await expect(reader.read("acme")).resolves.toEqual([{ subject: "u1", role: "Owner" }]);
    expect(seenAuth).toBe("Bearer svc-token");
  });

  it("returns null (no-op) on a non-OK status", async function _nonOk()
  {
    const fetchImpl = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const reader = _BuildHttpFleetMembershipReader("http://fleet:8080", "t", _log, fetchImpl);
    await expect(reader.read("acme")).resolves.toBeNull();
  });

  it("returns null (no-op) when the fleet is unreachable (fetch throws)", async function _unreachable()
  {
    const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const reader = _BuildHttpFleetMembershipReader("http://fleet:8080", "t", _log, fetchImpl);
    await expect(reader.read("acme")).resolves.toBeNull();
  });
});
