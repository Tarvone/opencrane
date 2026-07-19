-- Audit-owned target ledger. The live AuditEntry/audit_log table is intentionally untouched.
CREATE TYPE "AuditDecisionOutcome" AS ENUM ('allow', 'deny', 'error');
CREATE TYPE "AuditDecisionActorKind" AS ENUM ('user', 'agent-service', 'workload', 'system');

CREATE TABLE "audit_decisions" (
    "id" TEXT NOT NULL, "decision_digest" TEXT NOT NULL, "silo_id" TEXT NOT NULL,
    "actor_kind" "AuditDecisionActorKind" NOT NULL, "actor_id" TEXT NOT NULL, "audience" TEXT,
    "namespace" TEXT, "service_account_name" TEXT, "workload_kind" "WorkloadKind", "workload_uid" TEXT, "pod_uid" TEXT,
    "run_id" TEXT, "attempt" INTEGER, "agent_service_id" TEXT, "agent_revision_id" TEXT,
    "proof_key_id" TEXT, "proof_key_thumbprint" TEXT, "resource_kind" TEXT NOT NULL, "resource_id" TEXT NOT NULL,
    "action" TEXT NOT NULL, "catalog_id" TEXT NOT NULL, "catalog_revision" INTEGER NOT NULL,
    "catalog_digest" TEXT NOT NULL, "arguments_digest" TEXT NOT NULL,
    "policy_revision_hash" TEXT NOT NULL, "effective_authorization_digest" TEXT NOT NULL,
    "membership_revision" INTEGER,
    "outcome" "AuditDecisionOutcome" NOT NULL, "reason_code" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_decisions_exact_check" CHECK (
        "decision_digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("silo_id") <> '' AND btrim("actor_id") <> '' AND
        btrim("resource_kind") NOT IN ('', '*') AND btrim("resource_id") NOT IN ('', '*') AND
        btrim("action") <> '' AND btrim("catalog_id") <> '' AND "catalog_revision" > 0 AND
        "catalog_digest" ~ '^sha256:[0-9a-f]{64}$' AND "arguments_digest" ~ '^sha256:[0-9a-f]{64}$' AND
        "policy_revision_hash" ~ '^sha256:[0-9a-f]{64}$' AND
        "effective_authorization_digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("reason_code") <> ''
    ),
    CONSTRAINT "audit_decisions_run_coordinate_check" CHECK (
        ("run_id" IS NULL AND "attempt" IS NULL) OR
        ("run_id" IS NOT NULL AND btrim("run_id") <> '' AND "attempt" IS NOT NULL AND "attempt" > 0)
    ),
    CONSTRAINT "audit_decisions_workload_identity_check" CHECK (
        "actor_kind" <> 'workload' OR
        ("audience" IS NOT NULL AND btrim("audience") <> '' AND
         "namespace" IS NOT NULL AND btrim("namespace") <> '' AND
         "service_account_name" IS NOT NULL AND btrim("service_account_name") <> '' AND
         "workload_kind" IS NOT NULL AND "workload_uid" IS NOT NULL AND btrim("workload_uid") <> '' AND
         "pod_uid" IS NOT NULL AND btrim("pod_uid") <> '' AND
         "proof_key_thumbprint" IS NOT NULL AND "proof_key_thumbprint" ~ '^[A-Za-z0-9_-]{43}$')
    ),
    CONSTRAINT "audit_decisions_membership_revision_check" CHECK ("membership_revision" IS NULL OR "membership_revision" > 0)
);

CREATE UNIQUE INDEX "audit_decisions_decision_digest_key" ON "audit_decisions"("decision_digest");
CREATE INDEX "audit_decisions_silo_id_decided_at_idx" ON "audit_decisions"("silo_id", "decided_at");
CREATE INDEX "audit_decisions_run_id_attempt_decided_at_idx" ON "audit_decisions"("run_id", "attempt", "decided_at");
CREATE INDEX "audit_decisions_resource_kind_resource_id_decided_at_idx" ON "audit_decisions"("resource_kind", "resource_id", "decided_at");
CREATE INDEX "audit_decisions_actor_kind_actor_id_decided_at_idx" ON "audit_decisions"("actor_kind", "actor_id", "decided_at");

CREATE FUNCTION "reject_audit_decision_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'AuditDecision rows are append-only';
END;
$$;
CREATE TRIGGER "audit_decisions_append_only" BEFORE UPDATE OR DELETE ON "audit_decisions" FOR EACH ROW EXECUTE FUNCTION "reject_audit_decision_mutation"();
