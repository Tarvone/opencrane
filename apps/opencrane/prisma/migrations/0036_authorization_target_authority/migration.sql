-- Authorization-owned target authority. Schema only; no legacy grants or credentials are copied.
CREATE TYPE "AuthorizationScopeKind" AS ENUM ('organization', 'department', 'team', 'project', 'personal', 'direct-user');
CREATE TYPE "AuthorizationEffect" AS ENUM ('allow', 'deny');
CREATE TYPE "ApprovalRequestState" AS ENUM ('pending', 'approved', 'denied', 'expired', 'cancelled');
CREATE TYPE "ActionExecutionState" AS ENUM ('reserved', 'succeeded', 'failed');
CREATE TYPE "ActionReplayMode" AS ENUM ('one_shot', 'idempotent');

CREATE TABLE "authorization_grants" (
    "id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "subject_id" TEXT NOT NULL,
    "scope_kind" "AuthorizationScopeKind" NOT NULL, "organization_id" TEXT NOT NULL,
    "scope_resource_id" TEXT, "catalog_id" TEXT NOT NULL, "catalog_revision" INTEGER NOT NULL,
    "catalog_digest" TEXT NOT NULL, "capability_id" TEXT NOT NULL,
    "resource_kind" TEXT NOT NULL, "resource_id" TEXT NOT NULL,
    "effect" "AuthorizationEffect" NOT NULL, "priority" INTEGER NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3), "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "authorization_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "authorization_grants_exact_check" CHECK (
        btrim("silo_id") <> '' AND btrim("subject_id") NOT IN ('', '*') AND
        btrim("organization_id") <> '' AND btrim("catalog_id") <> '' AND "catalog_revision" > 0 AND
        btrim("catalog_digest") <> '' AND "catalog_digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("capability_id") <> '' AND
        btrim("resource_kind") NOT IN ('', '*') AND btrim("resource_id") NOT IN ('', '*') AND
        "priority" >= 0 AND btrim("created_by") <> ''
    ),
    CONSTRAINT "authorization_grants_scope_check" CHECK (
        ("scope_kind" = 'organization' AND "scope_resource_id" IS NULL) OR
        ("scope_kind" <> 'organization' AND "scope_resource_id" IS NOT NULL AND btrim("scope_resource_id") <> '')
    ),
    CONSTRAINT "authorization_grants_validity_check" CHECK ("expires_at" IS NULL OR "expires_at" > "valid_from")
);

CREATE TABLE "capability_catalog_revisions" (
    "id" TEXT NOT NULL, "catalog_id" TEXT NOT NULL, "revision" INTEGER NOT NULL,
    "digest" TEXT NOT NULL, "capabilities" JSONB NOT NULL, "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capability_catalog_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "capability_catalog_revisions_exact_check" CHECK (
        btrim("catalog_id") <> '' AND "revision" > 0 AND "digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("created_by") <> ''
    )
);

CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL, "run_id" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
    "agent_revision_id" TEXT NOT NULL, "agent_service_id" TEXT NOT NULL, "silo_id" TEXT NOT NULL,
    "proof_key_id" TEXT NOT NULL, "proof_key_thumbprint" TEXT NOT NULL, "subject_id" TEXT NOT NULL,
    "workload_audience" TEXT NOT NULL, "service_account_name" TEXT NOT NULL, "namespace" TEXT NOT NULL,
    "workload_kind" "WorkloadKind" NOT NULL, "workload_uid" TEXT NOT NULL, "pod_uid" TEXT NOT NULL,
    "catalog_id" TEXT NOT NULL, "catalog_revision" INTEGER NOT NULL, "catalog_digest" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,
    "resource_kind" TEXT NOT NULL, "resource_id" TEXT NOT NULL, "action" TEXT NOT NULL,
    "arguments_digest" TEXT NOT NULL, "action_digest" TEXT NOT NULL,
    "approver_policy_revision" TEXT NOT NULL, "effective_policy_digest" TEXT NOT NULL,
    "state" "ApprovalRequestState" NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3), "decided_by" TEXT, "resume_token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_requests_exact_check" CHECK (
        "attempt" > 0 AND btrim("agent_revision_id") <> '' AND btrim("agent_service_id") <> '' AND btrim("silo_id") <> '' AND
        "proof_key_thumbprint" ~ '^[A-Za-z0-9_-]{43}$' AND btrim("subject_id") <> '' AND
        btrim("workload_audience") <> '' AND btrim("service_account_name") <> '' AND btrim("namespace") <> '' AND
        btrim("workload_uid") <> '' AND btrim("pod_uid") <> '' AND
        btrim("catalog_id") <> '' AND "catalog_revision" > 0 AND "catalog_digest" ~ '^sha256:[0-9a-f]{64}$' AND
        btrim("capability_id") <> '' AND btrim("resource_kind") NOT IN ('', '*') AND
        btrim("resource_id") NOT IN ('', '*') AND btrim("action") <> '' AND
        "arguments_digest" ~ '^sha256:[0-9a-f]{64}$' AND "action_digest" ~ '^sha256:[0-9a-f]{64}$' AND
        btrim("approver_policy_revision") <> '' AND "effective_policy_digest" ~ '^sha256:[0-9a-f]{64}$' AND
        "expires_at" > "created_at"
    ),
    CONSTRAINT "approval_requests_decision_check" CHECK (
        ("state" = 'pending' AND "decided_at" IS NULL AND "decided_by" IS NULL AND "resume_token_hash" IS NULL) OR
        ("state" = 'approved' AND "decided_at" IS NOT NULL AND "decided_by" IS NOT NULL AND btrim("decided_by") <> '' AND "resume_token_hash" IS NOT NULL AND btrim("resume_token_hash") <> '') OR
        ("state" = 'denied' AND "decided_at" IS NOT NULL AND "decided_by" IS NOT NULL AND btrim("decided_by") <> '' AND "resume_token_hash" IS NULL) OR
        ("state" IN ('expired', 'cancelled') AND "decided_at" IS NOT NULL AND "resume_token_hash" IS NULL)
    )
);

CREATE TABLE "action_execution_receipts" (
    "id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "subject_id" TEXT NOT NULL,
    "audience" TEXT NOT NULL, "service_account_name" TEXT NOT NULL, "namespace" TEXT NOT NULL,
    "workload_kind" "WorkloadKind" NOT NULL, "workload_uid" TEXT NOT NULL,
    "pod_uid" TEXT NOT NULL, "run_id" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
    "agent_service_id" TEXT NOT NULL, "agent_revision_id" TEXT NOT NULL,
    "proof_key_id" TEXT NOT NULL, "proof_key_thumbprint" TEXT NOT NULL,
    "catalog_id" TEXT NOT NULL, "catalog_revision" INTEGER NOT NULL, "catalog_digest" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,
    "effective_policy_digest" TEXT NOT NULL, "resource_kind" TEXT NOT NULL, "resource_id" TEXT NOT NULL,
    "action" TEXT NOT NULL, "arguments_digest" TEXT NOT NULL, "jti" TEXT NOT NULL,
    "replay_mode" "ActionReplayMode" NOT NULL, "request_fingerprint" TEXT NOT NULL,
    "state" "ActionExecutionState" NOT NULL DEFAULT 'reserved', "result" JSONB, "failure_code" TEXT,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
    CONSTRAINT "action_execution_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "action_execution_receipts_exact_check" CHECK (
        btrim("silo_id") <> '' AND btrim("subject_id") <> '' AND btrim("audience") <> '' AND
        btrim("service_account_name") <> '' AND btrim("namespace") <> '' AND btrim("workload_uid") <> '' AND
        btrim("pod_uid") <> '' AND "attempt" > 0 AND btrim("agent_service_id") <> '' AND
        btrim("agent_revision_id") <> '' AND "proof_key_thumbprint" ~ '^[A-Za-z0-9_-]{43}$' AND
        btrim("catalog_id") <> '' AND "catalog_revision" > 0 AND "catalog_digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("capability_id") <> '' AND
        "effective_policy_digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("resource_kind") NOT IN ('', '*') AND
        btrim("resource_id") NOT IN ('', '*') AND btrim("action") <> '' AND "arguments_digest" ~ '^sha256:[0-9a-f]{64}$' AND
        btrim("jti") <> '' AND "request_fingerprint" ~ '^sha256:[0-9a-f]{64}$'
    ),
    CONSTRAINT "action_execution_receipts_state_check" CHECK (
        ("state" = 'reserved' AND "completed_at" IS NULL AND "result" IS NULL AND "failure_code" IS NULL) OR
        ("state" = 'succeeded' AND "completed_at" IS NOT NULL AND "result" IS NOT NULL AND "failure_code" IS NULL) OR
        ("state" = 'failed' AND "completed_at" IS NOT NULL AND "result" IS NULL AND "failure_code" IS NOT NULL AND btrim("failure_code") <> '')
    )
);

CREATE UNIQUE INDEX "authorization_grant_exact_authority_key" ON "authorization_grants"("silo_id", "subject_id", "scope_kind", "organization_id", "scope_resource_id", "catalog_id", "catalog_revision", "capability_id", "resource_kind", "resource_id", "effect", "priority") NULLS NOT DISTINCT;
CREATE INDEX "authorization_grants_silo_id_subject_id_scope_kind_organization_id_scope_resource_id_idx" ON "authorization_grants"("silo_id", "subject_id", "scope_kind", "organization_id", "scope_resource_id");
CREATE INDEX "authorization_grants_silo_id_resource_kind_resource_id_priority_idx" ON "authorization_grants"("silo_id", "resource_kind", "resource_id", "priority");
CREATE INDEX "authorization_grants_catalog_id_catalog_revision_capability_id_idx" ON "authorization_grants"("catalog_id", "catalog_revision", "capability_id");
CREATE UNIQUE INDEX "capability_catalog_revisions_catalog_id_revision_key" ON "capability_catalog_revisions"("catalog_id", "revision");
CREATE UNIQUE INDEX "capability_catalog_revisions_catalog_id_digest_key" ON "capability_catalog_revisions"("catalog_id", "digest");
CREATE UNIQUE INDEX "capability_catalog_revisions_catalog_id_revision_digest_key" ON "capability_catalog_revisions"("catalog_id", "revision", "digest");
CREATE UNIQUE INDEX "approval_requests_resume_token_hash_key" ON "approval_requests"("resume_token_hash");
CREATE UNIQUE INDEX "approval_requests_run_id_attempt_action_digest_key" ON "approval_requests"("run_id", "attempt", "action_digest");
CREATE INDEX "approval_requests_state_expires_at_idx" ON "approval_requests"("state", "expires_at");
CREATE INDEX "approval_requests_subject_id_idx" ON "approval_requests"("subject_id");
CREATE UNIQUE INDEX "action_execution_receipts_jti_key" ON "action_execution_receipts"("jti");
CREATE UNIQUE INDEX "action_execution_receipts_request_fingerprint_key" ON "action_execution_receipts"("request_fingerprint");
CREATE INDEX "action_execution_receipts_run_id_attempt_state_idx" ON "action_execution_receipts"("run_id", "attempt", "state");
CREATE INDEX "action_execution_receipts_replay_mode_state_idx" ON "action_execution_receipts"("replay_mode", "state");

ALTER TABLE "authorization_grants" ADD CONSTRAINT "authorization_grants_catalog_fkey" FOREIGN KEY ("catalog_id", "catalog_revision", "catalog_digest") REFERENCES "capability_catalog_revisions"("catalog_id", "revision", "digest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_run_revision_fkey" FOREIGN KEY ("run_id", "agent_service_id", "agent_revision_id") REFERENCES "agent_runs"("id", "agent_service_id", "agent_revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_proof_fkey" FOREIGN KEY ("proof_key_id", "run_id", "attempt", "workload_kind", "workload_uid", "proof_key_thumbprint", "pod_uid") REFERENCES "run_proof_keys"("id", "run_id", "attempt", "workload_kind", "workload_uid", "key_thumbprint", "pod_uid") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_assignment_fkey" FOREIGN KEY ("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "workload_audience", "service_account_name", "namespace", "workload_kind", "workload_uid") REFERENCES "workload_assignments"("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "audience", "service_account_name", "namespace", "workload_kind", "workload_uid") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_catalog_fkey" FOREIGN KEY ("catalog_id", "catalog_revision", "catalog_digest") REFERENCES "capability_catalog_revisions"("catalog_id", "revision", "digest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_execution_receipts" ADD CONSTRAINT "action_execution_receipts_run_identity_fkey" FOREIGN KEY ("run_id", "agent_service_id", "agent_revision_id") REFERENCES "agent_runs"("id", "agent_service_id", "agent_revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_execution_receipts" ADD CONSTRAINT "action_execution_receipts_proof_fkey" FOREIGN KEY ("proof_key_id", "run_id", "attempt", "workload_kind", "workload_uid", "proof_key_thumbprint", "pod_uid") REFERENCES "run_proof_keys"("id", "run_id", "attempt", "workload_kind", "workload_uid", "key_thumbprint", "pod_uid") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_execution_receipts" ADD CONSTRAINT "action_execution_receipts_catalog_fkey" FOREIGN KEY ("catalog_id", "catalog_revision", "catalog_digest") REFERENCES "capability_catalog_revisions"("catalog_id", "revision", "digest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_execution_receipts" ADD CONSTRAINT "action_execution_receipts_assignment_fkey" FOREIGN KEY ("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "service_account_name", "namespace", "workload_kind", "workload_uid") REFERENCES "workload_assignments"("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "service_account_name", "namespace", "workload_kind", "workload_uid") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_capability_catalog_revision_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'CapabilityCatalogRevision rows are immutable';
END;
$$;
CREATE TRIGGER "capability_catalog_revisions_immutable" BEFORE UPDATE OR DELETE ON "capability_catalog_revisions" FOR EACH ROW EXECUTE FUNCTION "reject_capability_catalog_revision_mutation"();

CREATE FUNCTION "enforce_authorization_grant_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'AuthorizationGrant rows cannot be deleted'; END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id"
        OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id" OR NEW."scope_kind" IS DISTINCT FROM OLD."scope_kind"
        OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."scope_resource_id" IS DISTINCT FROM OLD."scope_resource_id"
        OR NEW."catalog_id" IS DISTINCT FROM OLD."catalog_id" OR NEW."catalog_revision" IS DISTINCT FROM OLD."catalog_revision"
        OR NEW."catalog_digest" IS DISTINCT FROM OLD."catalog_digest" OR NEW."capability_id" IS DISTINCT FROM OLD."capability_id"
        OR NEW."resource_kind" IS DISTINCT FROM OLD."resource_kind" OR NEW."resource_id" IS DISTINCT FROM OLD."resource_id"
        OR NEW."effect" IS DISTINCT FROM OLD."effect" OR NEW."priority" IS DISTINCT FROM OLD."priority"
        OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from" OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
        OR NEW."created_by" IS DISTINCT FROM OLD."created_by" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'AuthorizationGrant authority fields are immutable';
    END IF;
    IF OLD."revoked_at" IS NOT NULL OR NEW."revoked_at" IS NULL THEN
        RAISE EXCEPTION 'AuthorizationGrant may be revoked exactly once';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "authorization_grants_immutable" BEFORE UPDATE OR DELETE ON "authorization_grants" FOR EACH ROW EXECUTE FUNCTION "enforce_authorization_grant_update"();

CREATE FUNCTION "enforce_approval_request_update"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    decision_time TIMESTAMP(3) := clock_timestamp();
    current_attempt INTEGER;
    current_run_state "AgentRunState";
    assignment_state "WorkloadAssignmentState";
    assignment_expires_at TIMESTAMP(3);
    proof_expires_at TIMESTAMP(3);
    proof_revoked_at TIMESTAMP(3);
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."state" <> 'pending' OR NEW."decided_at" IS NOT NULL
            OR NEW."decided_by" IS NOT NULL OR NEW."resume_token_hash" IS NOT NULL THEN
            RAISE EXCEPTION 'a new ApprovalRequest must begin pending';
        END IF;
        IF NEW."created_at" > decision_time OR NEW."expires_at" <= decision_time THEN
            RAISE EXCEPTION 'a new ApprovalRequest must have a current, future expiry';
        END IF;
        SELECT "attempt", "state" INTO current_attempt, current_run_state
        FROM "agent_runs" WHERE "id" = NEW."run_id" FOR UPDATE;
        SELECT "state", "expires_at" INTO assignment_state, assignment_expires_at
        FROM "workload_assignments"
        WHERE "run_id" = NEW."run_id" AND "attempt" = NEW."attempt"
          AND "agent_service_id" = NEW."agent_service_id" AND "agent_revision_id" = NEW."agent_revision_id"
          AND "silo_id" = NEW."silo_id" AND "subject_id" = NEW."subject_id"
          AND "audience" = NEW."workload_audience" AND "service_account_name" = NEW."service_account_name"
          AND "namespace" = NEW."namespace" AND "workload_kind" = NEW."workload_kind"
          AND "workload_uid" = NEW."workload_uid" AND "pod_uid" = NEW."pod_uid"
        FOR UPDATE;
        SELECT "expires_at", "revoked_at" INTO proof_expires_at, proof_revoked_at
        FROM "run_proof_keys"
        WHERE "id" = NEW."proof_key_id" AND "run_id" = NEW."run_id" AND "attempt" = NEW."attempt"
          AND "workload_kind" = NEW."workload_kind" AND "workload_uid" = NEW."workload_uid"
          AND "key_thumbprint" = NEW."proof_key_thumbprint" AND "pod_uid" = NEW."pod_uid"
        FOR UPDATE;
        IF current_attempt IS DISTINCT FROM NEW."attempt"
            OR current_run_state IS DISTINCT FROM 'waiting_for_approval'::"AgentRunState"
            OR assignment_state IS DISTINCT FROM 'registered'::"WorkloadAssignmentState"
            OR assignment_expires_at <= decision_time OR proof_revoked_at IS NOT NULL
            OR proof_expires_at <= decision_time THEN
            RAISE EXCEPTION 'ApprovalRequest requires current WaitingForApproval run, assignment, and proof authority';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ApprovalRequest rows cannot be deleted'; END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."run_id" IS DISTINCT FROM OLD."run_id"
        OR NEW."attempt" IS DISTINCT FROM OLD."attempt" OR NEW."agent_revision_id" IS DISTINCT FROM OLD."agent_revision_id"
        OR NEW."agent_service_id" IS DISTINCT FROM OLD."agent_service_id" OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id"
        OR NEW."proof_key_id" IS DISTINCT FROM OLD."proof_key_id" OR NEW."proof_key_thumbprint" IS DISTINCT FROM OLD."proof_key_thumbprint"
        OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id" OR NEW."workload_audience" IS DISTINCT FROM OLD."workload_audience"
        OR NEW."service_account_name" IS DISTINCT FROM OLD."service_account_name" OR NEW."namespace" IS DISTINCT FROM OLD."namespace"
        OR NEW."workload_kind" IS DISTINCT FROM OLD."workload_kind" OR NEW."workload_uid" IS DISTINCT FROM OLD."workload_uid"
        OR NEW."pod_uid" IS DISTINCT FROM OLD."pod_uid" OR NEW."catalog_id" IS DISTINCT FROM OLD."catalog_id"
        OR NEW."catalog_revision" IS DISTINCT FROM OLD."catalog_revision" OR NEW."catalog_digest" IS DISTINCT FROM OLD."catalog_digest"
        OR NEW."capability_id" IS DISTINCT FROM OLD."capability_id" OR NEW."resource_kind" IS DISTINCT FROM OLD."resource_kind"
        OR NEW."resource_id" IS DISTINCT FROM OLD."resource_id" OR NEW."action" IS DISTINCT FROM OLD."action"
        OR NEW."arguments_digest" IS DISTINCT FROM OLD."arguments_digest" OR NEW."action_digest" IS DISTINCT FROM OLD."action_digest"
        OR NEW."approver_policy_revision" IS DISTINCT FROM OLD."approver_policy_revision"
        OR NEW."effective_policy_digest" IS DISTINCT FROM OLD."effective_policy_digest"
        OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'ApprovalRequest proof and action bindings are immutable';
    END IF;
    IF OLD."state" <> 'pending' OR NEW."state" = 'pending' THEN
        RAISE EXCEPTION 'ApprovalRequest may be decided exactly once';
    END IF;
    NEW."decided_at" := decision_time;
    IF NEW."state" IN ('approved', 'denied') THEN
        SELECT "attempt", "state" INTO current_attempt, current_run_state
        FROM "agent_runs" WHERE "id" = OLD."run_id" FOR UPDATE;
        SELECT "state", "expires_at" INTO assignment_state, assignment_expires_at
        FROM "workload_assignments"
        WHERE "run_id" = OLD."run_id" AND "attempt" = OLD."attempt"
          AND "agent_service_id" = OLD."agent_service_id" AND "agent_revision_id" = OLD."agent_revision_id"
          AND "silo_id" = OLD."silo_id" AND "subject_id" = OLD."subject_id"
          AND "audience" = OLD."workload_audience" AND "service_account_name" = OLD."service_account_name"
          AND "namespace" = OLD."namespace" AND "workload_kind" = OLD."workload_kind"
          AND "workload_uid" = OLD."workload_uid" AND "pod_uid" = OLD."pod_uid"
        FOR UPDATE;
        SELECT "expires_at", "revoked_at" INTO proof_expires_at, proof_revoked_at
        FROM "run_proof_keys" WHERE "id" = OLD."proof_key_id" FOR UPDATE;
        IF current_attempt IS DISTINCT FROM OLD."attempt"
            OR current_run_state IS DISTINCT FROM 'waiting_for_approval'::"AgentRunState"
            OR assignment_state IS DISTINCT FROM 'registered'::"WorkloadAssignmentState"
            OR assignment_expires_at <= decision_time OR proof_revoked_at IS NOT NULL
            OR proof_expires_at <= decision_time THEN
            NEW."state" := 'cancelled';
            NEW."decided_by" := NULL;
            NEW."resume_token_hash" := NULL;
            RETURN NEW;
        END IF;
    END IF;
    IF NEW."state" = 'expired' THEN
        IF decision_time < OLD."expires_at" THEN
            RAISE EXCEPTION 'ApprovalRequest may expire only after its deadline';
        END IF;
    ELSIF decision_time >= OLD."expires_at" THEN
        RAISE EXCEPTION 'ApprovalRequest decisions must be recorded before expiry';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "approval_requests_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "approval_requests" FOR EACH ROW EXECUTE FUNCTION "enforce_approval_request_update"();

CREATE FUNCTION "enforce_action_execution_receipt_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    reservation_time TIMESTAMP(3) := clock_timestamp();
    current_attempt INTEGER;
    current_run_state "AgentRunState";
    assignment_state "WorkloadAssignmentState";
    assignment_expires_at TIMESTAMP(3);
    proof_expires_at TIMESTAMP(3);
    proof_revoked_at TIMESTAMP(3);
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."state" <> 'reserved' OR NEW."result" IS NOT NULL
            OR NEW."failure_code" IS NOT NULL OR NEW."completed_at" IS NOT NULL THEN
            RAISE EXCEPTION 'a new ActionExecutionReceipt must begin reserved without a result, failure, or completion';
        END IF;
        SELECT "attempt", "state" INTO current_attempt, current_run_state
        FROM "agent_runs" WHERE "id" = NEW."run_id" FOR UPDATE;
        IF current_attempt IS DISTINCT FROM NEW."attempt"
            OR current_run_state IS DISTINCT FROM 'running'::"AgentRunState" THEN
            RAISE EXCEPTION 'ActionExecutionReceipt requires the current Running AgentRun attempt';
        END IF;
        SELECT "state", "expires_at" INTO assignment_state, assignment_expires_at
        FROM "workload_assignments"
        WHERE "run_id" = NEW."run_id" AND "attempt" = NEW."attempt"
          AND "agent_service_id" = NEW."agent_service_id" AND "agent_revision_id" = NEW."agent_revision_id"
          AND "silo_id" = NEW."silo_id" AND "subject_id" = NEW."subject_id"
          AND "service_account_name" = NEW."service_account_name" AND "namespace" = NEW."namespace"
          AND "workload_kind" = NEW."workload_kind" AND "workload_uid" = NEW."workload_uid"
          AND "pod_uid" = NEW."pod_uid" FOR UPDATE;
        IF assignment_state IS DISTINCT FROM 'registered'::"WorkloadAssignmentState"
            OR assignment_expires_at <= reservation_time THEN
            RAISE EXCEPTION 'ActionExecutionReceipt requires a current Registered WorkloadAssignment';
        END IF;
        SELECT "expires_at", "revoked_at" INTO proof_expires_at, proof_revoked_at
        FROM "run_proof_keys"
        WHERE "id" = NEW."proof_key_id" AND "run_id" = NEW."run_id" AND "attempt" = NEW."attempt"
          AND "workload_kind" = NEW."workload_kind" AND "workload_uid" = NEW."workload_uid"
          AND "key_thumbprint" = NEW."proof_key_thumbprint" AND "pod_uid" = NEW."pod_uid"
        FOR UPDATE;
        IF proof_revoked_at IS NOT NULL OR proof_expires_at <= reservation_time THEN
            RAISE EXCEPTION 'ActionExecutionReceipt requires a current unrevoked RunProofKey';
        END IF;
        NEW."reserved_at" := reservation_time;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ActionExecutionReceipt rows cannot be deleted'; END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id"
        OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id" OR NEW."audience" IS DISTINCT FROM OLD."audience"
        OR NEW."service_account_name" IS DISTINCT FROM OLD."service_account_name" OR NEW."namespace" IS DISTINCT FROM OLD."namespace"
        OR NEW."workload_kind" IS DISTINCT FROM OLD."workload_kind" OR NEW."workload_uid" IS DISTINCT FROM OLD."workload_uid"
        OR NEW."pod_uid" IS DISTINCT FROM OLD."pod_uid" OR NEW."run_id" IS DISTINCT FROM OLD."run_id"
        OR NEW."attempt" IS DISTINCT FROM OLD."attempt" OR NEW."agent_service_id" IS DISTINCT FROM OLD."agent_service_id"
        OR NEW."agent_revision_id" IS DISTINCT FROM OLD."agent_revision_id" OR NEW."proof_key_id" IS DISTINCT FROM OLD."proof_key_id"
        OR NEW."proof_key_thumbprint" IS DISTINCT FROM OLD."proof_key_thumbprint" OR NEW."catalog_id" IS DISTINCT FROM OLD."catalog_id"
        OR NEW."catalog_revision" IS DISTINCT FROM OLD."catalog_revision" OR NEW."catalog_digest" IS DISTINCT FROM OLD."catalog_digest"
        OR NEW."capability_id" IS DISTINCT FROM OLD."capability_id" OR NEW."effective_policy_digest" IS DISTINCT FROM OLD."effective_policy_digest"
        OR NEW."resource_kind" IS DISTINCT FROM OLD."resource_kind" OR NEW."resource_id" IS DISTINCT FROM OLD."resource_id"
        OR NEW."action" IS DISTINCT FROM OLD."action" OR NEW."arguments_digest" IS DISTINCT FROM OLD."arguments_digest"
        OR NEW."jti" IS DISTINCT FROM OLD."jti" OR NEW."replay_mode" IS DISTINCT FROM OLD."replay_mode"
        OR NEW."request_fingerprint" IS DISTINCT FROM OLD."request_fingerprint" OR NEW."reserved_at" IS DISTINCT FROM OLD."reserved_at" THEN
        RAISE EXCEPTION 'ActionExecutionReceipt request bindings are immutable';
    END IF;
    IF OLD."state" <> 'reserved' OR NEW."state" = 'reserved' THEN
        RAISE EXCEPTION 'ActionExecutionReceipt may complete exactly once';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "action_execution_receipts_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "action_execution_receipts" FOR EACH ROW EXECUTE FUNCTION "enforce_action_execution_receipt_lifecycle"();
