import type { Express } from "express";
import * as k8s from "@kubernetes/client-node";
import type { PrismaClient } from "@prisma/client";

import { aiBudgetRouter, tokenUsageRouter, spendRouter } from "@opencrane/backend/server/reporting/spend";
import { auditRouter } from "@opencrane/backend/server/iam/audit";
import { groupsRouter } from "@opencrane/backend/server/iam/groups";
import { _RegisterInternalTenantContract } from "@opencrane/backend/server/tenancy/contract";
import { _RegisterInternalTenantModels, modelRoutingDefaultsRouter, modelRoutingMetricsRouter } from "@opencrane/backend/server/gateways/model-routing";
import { _RegisterInternalParticipation, awarenessRolloutRouter, awarenessParticipationRouter } from "@opencrane/backend/server/reporting/awareness";
import { mcpOperatorRouter, mcpServersRouter } from "@opencrane/backend/server/gateways/mcp";
import { metricsRouter, prometheusMetricsRouter } from "@opencrane/backend/server/reporting/metrics";
import { policiesRouter } from "@opencrane/backend/server/iam/policies";
import { providerKeysRouter, providerCredentialsRouter, providerByokRouter, modelRegistryRouter } from "@opencrane/backend/server/gateways/providers";
import { resourceSharesRouter, sharesRouter } from "@opencrane/backend/server/iam/grants";
import { tenantsRouter } from "@opencrane/backend/server/tenancy/tenants";
import { thirdPartySourcesRouter } from "@opencrane/backend/server/knowledge/retrieval";
import { _BuildDocMergeReconciler, companyDocsRouter } from "@opencrane/backend/server/knowledge/company-docs";
import { _CheckDbHealth, _OpenapiRouter } from "@opencrane/server/_infra/http";
import { _RegisterInternalAgentRuntimeStream, type RuntimeCommandStreamAuthority, type RuntimeTokenReviewer, type RuntimeWorkloadIdentity } from "@opencrane/server/_infra/agent-runtime-stream";
import { AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE } from "@opencrane/contracts";
import { spec } from "@opencrane/backend/server/api-spec";

/** Extract and validate the exact Kubernetes ServiceAccount subject grammar. */
function _ParseRuntimeSubject(subject: string, expectedNamespace: string, podUid: string | null): RuntimeWorkloadIdentity | null
{
  const parts = subject.split(":");
	const serviceAccountName = parts[3];
	if (parts.length !== 4 || parts[0] !== "system" || parts[1] !== "serviceaccount" || parts[2] !== expectedNamespace || !serviceAccountName || !/^agent-runtime-[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(serviceAccountName) || serviceAccountName.length > 63 || !podUid)
  {
    return null;
  }
	return { subject, namespace: expectedNamespace, serviceAccountName, podUid };
}

/** Read the pod UID claim Kubernetes attaches to a bound projected ServiceAccount token. */
function _ReadReviewedPodUid(extra: Record<string, string[]> | undefined): string | null
{
	const podUid = extra?.["authentication.kubernetes.io/pod-uid"]?.[0];
	return typeof podUid === "string" && podUid.length > 0 ? podUid : null;
}

/** Build the app-owned Kubernetes TokenReview adapter for a runtime projected token. */
function _CreateRuntimeTokenReviewer(authApi: k8s.AuthenticationV1Api): RuntimeTokenReviewer
{
  const expectedNamespace = process.env.POD_NAMESPACE?.trim() || "default";
  return {
    async __Review(token: string): Promise<RuntimeWorkloadIdentity | null>
    {
      const body = new k8s.V1TokenReview();
      body.spec = new k8s.V1TokenReviewSpec();
      body.spec.token = token;
		body.spec.audiences = [AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE];
      const review = await authApi.createTokenReview({ body });
      const status = review.status;
		if (!status?.authenticated || !status.audiences?.includes(AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE))
      {
        return null;
      }
		return _ParseRuntimeSubject(status.user?.username ?? "", expectedNamespace, _ReadReviewedPodUid(status.user?.extra));
    },
  };
}

/**
 * Deliberately empty composition until the next controller slice owns durable runtime assignments.
 * It permits an authenticated shell to stay connected but accepts no candidate and issues no command.
 */
const _NoRuntimeAssignmentAuthority: RuntimeCommandStreamAuthority = {
  async __NextCommand(): Promise<null>
  {
    return null;
  },
  async __AdmitCandidate(): Promise<{ accepted: false; reason: string }>
  {
    return { accepted: false, reason: "RUNTIME_ASSIGNMENT_UNAVAILABLE" };
  },
};

/**
 * Registers all API routes on the given Express application instance.
 * All business routes are namespaced under /api/v1/.
 * Infrastructure routes (/healthz, /prom) remain at the root.
 *
 * @param app       - Express application to register routes on.
 * @param prisma    - Prisma ORM client for database access in route handlers.
 * @param customApi - Kubernetes Custom Objects API client for tenant and policy management.
 * @param coreApi   - Kubernetes Core V1 API client for AI budget management.
 * @param authApi   - Kubernetes Authentication API for tenant contract TokenReview validation.
 * @returns The Express application instance with registered routes.
 */
/**
 * Mount the internal (`/api/internal/*`) routers. These MUST be registered BEFORE the
 * session `___AuthMiddleware` (see index.ts) — mounting them after it 401s every caller:
 *   - The NetworkPolicy-only `tenant-models` route takes no token; access is
 *     enforced at the network layer. The operator fetches `tenant-models` on its own
 *     reconcile hot path with no credential, so behind session auth it 401s → the model
 *     set is always null → replace-mode pods brick with an empty allowlist.
 *   - pod-identity routes (`contract`, `participation`) run their OWN TokenReview over a
 *     projected pod token, which the browser-session middleware cannot satisfy.
 * @see apps/opencrane/helm/templates/_networkpolicy.tpl — the runtime-plane policies.
 */
export function _RegisterInternalRoutes(app: Express, prisma: PrismaClient, authApi: k8s.AuthenticationV1Api): void
{
  // NetworkPolicy-only (no auth/TokenReview): the operator fetches a tenant's
  // allowed model set + effective default at reconcile. Best-effort — never 404/500.
  app.use("/api/internal/tenant-models", _RegisterInternalTenantModels(prisma));
  // Note: /api/internal/contract enforces per-tenant identity via TokenReview — not NetworkPolicy-only.
  app.use("/api/internal/contract", _RegisterInternalTenantContract(prisma, authApi));
  app.use("/api/internal/awareness/participation", _RegisterInternalParticipation(prisma, authApi));
  // The runtime opens this internal SSE connection itself. TokenReview is the identity
  // boundary; the intentionally empty authority below cannot issue commands or persist data.
  app.use("/api/internal/agent-runtime", _RegisterInternalAgentRuntimeStream({
    tokenReviewer: _CreateRuntimeTokenReviewer(authApi),
    authority: _NoRuntimeAssignmentAuthority,
    maxBodyBytes: 64 * 1024,
    heartbeatMilliseconds: 15_000,
    commandPollMilliseconds: 1_000,
  }));
}

/**
 * Mount authenticated public API and infrastructure routes.
 *
 * @param app - Express application to register routes on.
 * @param prisma - Prisma client used by route handlers.
 * @param customApi - Kubernetes custom objects client.
 * @param coreApi - Kubernetes core API client.
 * @param authApi - Kubernetes authentication API client.
 * @returns The configured Express application.
 */
export function _RegisterRoutes(app: Express, prisma: PrismaClient, customApi: k8s.CustomObjectsApi, coreApi: k8s.CoreV1Api, authApi: k8s.AuthenticationV1Api): Express
{
  // NOTE: the internal (`/api/internal/*`) routers are mounted separately by
  // `_RegisterInternalRoutes`, which index.ts calls BEFORE `___AuthMiddleware` so the
  // operator's tokenless reconcile fetch + the pod-identity TokenReview routes are not
  // gated by the browser-session auth. Do NOT re-mount them here.
  app.use("/api/v1/metrics", metricsRouter(customApi, prisma));
  app.use("/api/v1/audit", auditRouter(prisma));
  app.use("/api/v1/tenants", tenantsRouter(customApi, prisma, coreApi));
  app.use("/api/v1/policies", policiesRouter(customApi, prisma));
  app.use("/api/v1/ai-budget", aiBudgetRouter(coreApi, prisma));
  app.use("/api/v1/token-usage", tokenUsageRouter(prisma));
  app.use("/api/v1/groups", groupsRouter(prisma));
  app.use("/api/v1/mcp-servers", mcpServersRouter(prisma));
  app.use("/api/v1/mcp", mcpOperatorRouter(prisma));
  app.use("/api/v1/shares", sharesRouter(prisma));
  app.use("/api/v1/resource-shares", resourceSharesRouter(prisma));
  app.use("/api/v1/model-routing/defaults", modelRoutingDefaultsRouter(prisma));
  app.use("/api/v1/model-routing/metrics", modelRoutingMetricsRouter(prisma));
  app.use("/api/v1/third-party-sources", thirdPartySourcesRouter(prisma));
  app.use("/api/v1/org/workspace-docs", companyDocsRouter(prisma, _BuildDocMergeReconciler()));
  // NOTE: the fleet / super-admin surfaces — ClusterTenant lifecycle, billing accounts, org
  // membership, platform DNS, and Zitadel administration — have moved to the cluster-wide
  // fleet-manager (Stage 4). The silo keeps ClusterTenant + OrgMembership as local READ-MODELS
  // (for per-org login + the org-admin gate) but no longer SERVES their management API.
  app.use("/api/v1/awareness/rollout", awarenessRolloutRouter(prisma));
  app.use("/api/v1/awareness/participation", awarenessParticipationRouter(prisma));
  app.use("/api/v1/spend", spendRouter(prisma));
  app.use("/api/v1/providers/keys", providerKeysRouter(prisma));
  app.use("/api/v1/providers/credentials", providerCredentialsRouter(prisma));
  // BYOK raw-key path — writes the silo's provider key Secret in the operator's own namespace
  // (POD_NAMESPACE, downward-API populated; "default" fallback mirrors config._readOwnNamespace).
  app.use("/api/v1/providers/byok", providerByokRouter(prisma, coreApi, process.env.POD_NAMESPACE?.trim() || "default"));
  app.use("/api/v1/models", modelRegistryRouter(prisma));
  app.use("/api/v1/openapi.json", _OpenapiRouter(spec));
  app.get("/healthz", _CheckDbHealth(prisma));
  app.use("/prom", prometheusMetricsRouter(prisma, customApi));
  return app;
}
