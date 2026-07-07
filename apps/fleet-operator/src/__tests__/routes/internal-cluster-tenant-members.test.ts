import express from "express";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../generated/prisma/index.js";
import { _RegisterInternalClusterTenantMembers } from "../../routes/internal/cluster-tenant-members.js";

/**
 * Route tests for the fleet → silo membership projection SOURCE (#126 S2):
 *   - returns the org's authoritative memberships (subject + role) for the silo repairer,
 *   - 404 when the org is unknown.
 */

/** A membership fixture row. */
interface Membership { clusterTenant: string; subject: string; role: string }

/** Build a Prisma stub over in-memory orgs + memberships. */
function _mockPrisma(orgs: string[], memberships: Membership[]): PrismaClient
{
  const orgSet = new Set(orgs);
  return {
    clusterTenant: {
      findUnique: vi.fn(async function _findUnique(args: { where: { name: string } }) { return orgSet.has(args.where.name) ? { name: args.where.name } : null; }),
    },
    orgMembership: {
      findMany: vi.fn(async function _findMany(args: { where: { clusterTenant: string } })
      {
        return memberships.filter(m => m.clusterTenant === args.where.clusterTenant).map(m => ({ subject: m.subject, role: m.role }));
      }),
    },
  } as unknown as PrismaClient;
}

/** Mount the internal members router (no session/auth — the outer middleware gates it in prod). */
function _buildApp(prisma: PrismaClient): Express
{
  const app = express();
  app.use(express.json());
  app.use("/api/internal/cluster-tenants", _RegisterInternalClusterTenantMembers(prisma));
  return app;
}

describe("_RegisterInternalClusterTenantMembers — fleet→silo membership source (#126 S2)", function _suite()
{
  it("returns the org's authoritative memberships for the silo repairer", async function _lists()
  {
    const prisma = _mockPrisma(["acme"], [
      { clusterTenant: "acme", subject: "owner-1", role: "Owner" },
      { clusterTenant: "acme", subject: "user-2", role: "Member" },
      { clusterTenant: "other", subject: "x", role: "Owner" },
    ]);
    const res = await request(_buildApp(prisma)).get("/api/internal/cluster-tenants/acme/members");

    expect(res.status).toBe(200);
    expect(res.body.clusterTenant).toBe("acme");
    expect(res.body.members).toEqual([
      { subject: "owner-1", role: "Owner" },
      { subject: "user-2", role: "Member" },
    ]);
  });

  it("returns 404 for an unknown org", async function _missing()
  {
    const res = await request(_buildApp(_mockPrisma([], []))).get("/api/internal/cluster-tenants/ghost/members");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CLUSTER_TENANT_NOT_FOUND");
  });
});
