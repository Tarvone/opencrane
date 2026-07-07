import { Router } from "express";
import type { Request } from "express";

import type { PrismaClient } from "../../generated/prisma/index.js";
import type { InternalOrgMembershipView } from "./cluster-tenant-members.types.js";

/**
 * Internal (fleet → silo) org-membership projection SOURCE.
 *
 * The fleet registry owns the authoritative `OrgMembership` rows; a silo has no way to
 * read them across the DB boundary, so it pulls them from this endpoint and upserts its
 * own local `OrgMembership` read-model (mirroring the Tenant-projection channel). This is
 * the fleet→silo membership seam decided for #126: a silo-side projection repairer over a
 * fleet internal endpoint, NOT a ClusterTenant CR field.
 *
 * Auth: mounted under `/api/internal/*`, which the fleet's `___AuthMiddleware` does NOT
 * bypass — a caller must present the shared `OPENCRANE_API_TOKEN` bearer (the silo repairer's
 * service credential) — and is additionally NetworkPolicy-gated to platform pods at the
 * network layer. Read-only: it never mutates the registry.
 *
 * @param prisma - Fleet registry Prisma client.
 * @returns Configured Express router (mount at `/api/internal/cluster-tenants`).
 */
export function _RegisterInternalClusterTenantMembers(prisma: PrismaClient): Router
{
  const router = Router();

  /** List an org's authoritative memberships for the silo projection repairer. */
  router.get("/:name/members", async function _listMembers(req: Request<{ name: string }>, res)
  {
    const orgName = req.params.name;

    const org = await prisma.clusterTenant.findUnique({ where: { name: orgName }, select: { name: true } });
    if (!org)
    {
      res.status(404).json({ error: "Cluster tenant not found", code: "CLUSTER_TENANT_NOT_FOUND" });
      return;
    }

    const rows = await prisma.orgMembership.findMany({
      where: { clusterTenant: orgName },
      orderBy: { createdAt: "asc" },
      select: { subject: true, role: true },
    });

    const members: InternalOrgMembershipView[] = rows.map(function _toView(row)
    {
      return { subject: row.subject, role: row.role };
    });
    res.json({ clusterTenant: orgName, members });
  });

  return router;
}
