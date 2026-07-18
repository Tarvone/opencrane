-- Runs-owned target authority. Schema only; there is deliberately no AgentRunAttempt table.
CREATE TYPE "AgentRunTrigger" AS ENUM ('interactive', 'schedule', 'managed_invocation');
CREATE TYPE "AgentRunState" AS ENUM ('accepted', 'queued', 'assigned', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled');
CREATE TYPE "AgentRunTerminalReason" AS ENUM ('success', 'user_cancelled', 'policy_denied', 'budget_exhausted', 'runtime_failure', 'invalid_input');
CREATE TYPE "WorkloadAssignmentState" AS ENUM ('pending_pod', 'registered', 'revoked');
CREATE TYPE "WorkloadKind" AS ENUM ('job', 'deployment');
CREATE TYPE "RunOutboxEventKind" AS ENUM ('run.accepted', 'run.attempt_requested', 'run.cancellation_requested', 'run.resume_requested');

CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "agent_service_id" TEXT NOT NULL,
    "agent_revision_id" TEXT NOT NULL, "thread_id" TEXT, "trigger" "AgentRunTrigger" NOT NULL,
    "delegated_user_id" TEXT, "request_idempotency_key" TEXT NOT NULL,
    "root_run_id" TEXT NOT NULL, "parent_run_id" TEXT, "attempt" INTEGER NOT NULL DEFAULT 1,
    "state" "AgentRunState" NOT NULL DEFAULT 'accepted',
    "effective_contract_digest" TEXT NOT NULL, "input_snapshot_digest" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3), "terminal_reason" "AgentRunTerminalReason",
    "cost_amount" DECIMAL(18,6), "cost_currency" TEXT,
    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_runs_attempt_check" CHECK ("attempt" > 0),
    CONSTRAINT "agent_runs_nonempty_check" CHECK (
        btrim("silo_id") <> '' AND btrim("agent_service_id") <> '' AND
        btrim("agent_revision_id") <> '' AND btrim("request_idempotency_key") <> '' AND
        btrim("root_run_id") <> '' AND btrim("effective_contract_digest") <> '' AND
        btrim("input_snapshot_digest") <> '' AND
        "effective_contract_digest" ~ '^sha256:[0-9a-f]{64}$' AND
        "input_snapshot_digest" ~ '^sha256:[0-9a-f]{64}$'
    ),
    CONSTRAINT "agent_runs_terminal_check" CHECK (
        ("state" IN ('completed', 'failed', 'cancelled') AND "finished_at" IS NOT NULL AND "terminal_reason" IS NOT NULL) OR
        ("state" NOT IN ('completed', 'failed', 'cancelled') AND "finished_at" IS NULL AND "terminal_reason" IS NULL)
    ),
    CONSTRAINT "agent_runs_terminal_reason_check" CHECK (
        ("state" = 'completed' AND "terminal_reason" = 'success') OR
        ("state" = 'cancelled' AND "terminal_reason" = 'user_cancelled') OR
        ("state" = 'failed' AND "terminal_reason" NOT IN ('success', 'user_cancelled')) OR
        "state" NOT IN ('completed', 'failed', 'cancelled')
    ),
    CONSTRAINT "agent_runs_cost_check" CHECK (
        ("cost_amount" IS NULL AND "cost_currency" IS NULL) OR
        ("cost_amount" IS NOT NULL AND "cost_amount" >= 0 AND "cost_currency" IS NOT NULL AND btrim("cost_currency") <> '')
    )
);

CREATE TABLE "run_input_snapshots" (
    "id" TEXT NOT NULL, "run_id" TEXT NOT NULL, "snapshot_version" INTEGER NOT NULL,
    "silo_id" TEXT NOT NULL, "agent_service_id" TEXT NOT NULL, "agent_revision_id" TEXT NOT NULL,
    "effective_contract_digest" TEXT NOT NULL, "persona_revision_id" TEXT,
    "identity_snapshot" JSONB NOT NULL, "model_route" JSONB NOT NULL,
    "tool_grant_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "skill_revision_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "memory_query_policy" JSONB NOT NULL, "budget_policy" JSONB NOT NULL,
    "prompt_compiler_version" TEXT NOT NULL, "input_digest" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_input_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "run_input_snapshots_version_check" CHECK ("snapshot_version" > 0),
    CONSTRAINT "run_input_snapshots_nonempty_check" CHECK (
        btrim("silo_id") <> '' AND btrim("agent_service_id") <> '' AND btrim("agent_revision_id") <> '' AND
        btrim("effective_contract_digest") <> '' AND btrim("prompt_compiler_version") <> '' AND btrim("input_digest") <> '' AND
        "effective_contract_digest" ~ '^sha256:[0-9a-f]{64}$' AND "input_digest" ~ '^sha256:[0-9a-f]{64}$'
    )
);

CREATE TABLE "workload_assignments" (
    "run_id" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
    "agent_service_id" TEXT NOT NULL, "agent_revision_id" TEXT NOT NULL,
    "silo_id" TEXT NOT NULL, "subject_id" TEXT NOT NULL, "audience" TEXT NOT NULL,
    "service_account_name" TEXT NOT NULL, "namespace" TEXT NOT NULL,
    "workload_kind" "WorkloadKind" NOT NULL, "workload_uid" TEXT NOT NULL, "pod_uid" TEXT,
    "state" "WorkloadAssignmentState" NOT NULL DEFAULT 'pending_pod',
    "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3),
    CONSTRAINT "workload_assignments_pkey" PRIMARY KEY ("run_id", "attempt"),
    CONSTRAINT "workload_assignments_attempt_check" CHECK ("attempt" > 0),
    CONSTRAINT "workload_assignments_nonempty_check" CHECK (
        btrim("agent_service_id") <> '' AND btrim("agent_revision_id") <> '' AND btrim("silo_id") <> '' AND
        btrim("subject_id") <> '' AND "audience" = 'opencrane' AND btrim("service_account_name") <> '' AND
        btrim("namespace") <> '' AND btrim("workload_uid") <> ''
    ),
    CONSTRAINT "workload_assignments_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "workload_assignments_state_check" CHECK (
        ("state" = 'pending_pod' AND "pod_uid" IS NULL AND "registered_at" IS NULL AND "revoked_at" IS NULL) OR
        ("state" = 'registered' AND "pod_uid" IS NOT NULL AND btrim("pod_uid") <> '' AND "registered_at" IS NOT NULL AND "revoked_at" IS NULL) OR
        ("state" = 'revoked' AND "revoked_at" IS NOT NULL)
    )
);

CREATE TABLE "workload_bootstraps" (
    "id" TEXT NOT NULL, "run_id" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
    "agent_service_id" TEXT NOT NULL, "agent_revision_id" TEXT NOT NULL,
    "silo_id" TEXT NOT NULL, "subject_id" TEXT NOT NULL, "audience" TEXT NOT NULL,
    "service_account_name" TEXT NOT NULL, "namespace" TEXT NOT NULL,
    "workload_kind" "WorkloadKind" NOT NULL, "workload_uid" TEXT NOT NULL, "claim_digest" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL, "consumed_at" TIMESTAMP(3),
    "consumed_by_pod_uid" TEXT, "receipt_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workload_bootstraps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workload_bootstraps_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "workload_bootstraps_claim_digest_check" CHECK ("claim_digest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "workload_bootstraps_audience_check" CHECK ("audience" = 'opencrane'),
    CONSTRAINT "workload_bootstraps_consumption_check" CHECK (
        ("consumed_at" IS NULL AND "consumed_by_pod_uid" IS NULL AND "receipt_id" IS NULL) OR
        ("consumed_at" IS NOT NULL AND "consumed_by_pod_uid" IS NOT NULL AND btrim("consumed_by_pod_uid") <> '' AND "receipt_id" IS NOT NULL AND btrim("receipt_id") <> '')
    )
);

CREATE TABLE "run_proof_keys" (
    "id" TEXT NOT NULL, "bootstrap_id" TEXT NOT NULL, "run_id" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
    "workload_kind" "WorkloadKind" NOT NULL, "workload_uid" TEXT NOT NULL,
    "pod_uid" TEXT NOT NULL, "public_key_jwk" JSONB NOT NULL, "key_thumbprint" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL, "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_proof_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "run_proof_keys_nonempty_check" CHECK (btrim("workload_uid") <> '' AND btrim("pod_uid") <> '' AND "key_thumbprint" ~ '^[A-Za-z0-9_-]{43}$'),
    CONSTRAINT "run_proof_keys_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE TABLE "run_outbox_events" (
    "id" TEXT NOT NULL, "run_id" TEXT NOT NULL, "attempt" INTEGER NOT NULL, "sequence" INTEGER NOT NULL,
    "kind" "RunOutboxEventKind" NOT NULL, "idempotency_key" TEXT NOT NULL, "payload" JSONB NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimed_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3), "failed_at" TIMESTAMP(3), "failure_code" TEXT,
    "delivery_count" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "run_outbox_events_coordinate_check" CHECK ("attempt" > 0 AND "sequence" > 0),
    CONSTRAINT "run_outbox_events_delivery_check" CHECK (
        "delivery_count" >= 0 AND NOT ("published_at" IS NOT NULL AND "failed_at" IS NOT NULL) AND
        (("claimed_at" IS NULL AND "delivery_count" = 0 AND "published_at" IS NULL AND "failed_at" IS NULL) OR
         ("claimed_at" IS NOT NULL AND "delivery_count" > 0)) AND
        ("published_at" IS NULL OR "published_at" >= "claimed_at") AND
        ("failed_at" IS NULL OR "failed_at" >= "claimed_at") AND
        (("failed_at" IS NULL AND "failure_code" IS NULL) OR
         ("failed_at" IS NOT NULL AND "failure_code" IS NOT NULL AND btrim("failure_code") <> ''))
    )
);

CREATE UNIQUE INDEX "agent_runs_silo_id_request_idempotency_key_key" ON "agent_runs"("silo_id", "request_idempotency_key");
CREATE UNIQUE INDEX "agent_runs_id_agent_service_id_agent_revision_id_key" ON "agent_runs"("id", "agent_service_id", "agent_revision_id");
CREATE UNIQUE INDEX "agent_runs_id_silo_id_agent_service_id_agent_revision_id_key" ON "agent_runs"("id", "silo_id", "agent_service_id", "agent_revision_id");
CREATE UNIQUE INDEX "agent_runs_id_agent_revision_id_key" ON "agent_runs"("id", "agent_revision_id");
CREATE UNIQUE INDEX "agent_runs_id_input_snapshot_digest_key" ON "agent_runs"("id", "input_snapshot_digest");
CREATE UNIQUE INDEX "agent_run_snapshot_identity_key" ON "agent_runs"("id", "input_snapshot_digest", "silo_id", "agent_service_id", "agent_revision_id", "effective_contract_digest");
CREATE INDEX "agent_runs_agent_service_id_state_idx" ON "agent_runs"("agent_service_id", "state");
CREATE INDEX "agent_runs_thread_id_accepted_at_idx" ON "agent_runs"("thread_id", "accepted_at");
CREATE INDEX "agent_runs_root_run_id_idx" ON "agent_runs"("root_run_id");
CREATE UNIQUE INDEX "run_input_snapshots_run_id_key" ON "run_input_snapshots"("run_id");
CREATE UNIQUE INDEX "run_input_snapshots_input_digest_key" ON "run_input_snapshots"("input_digest");
CREATE UNIQUE INDEX "run_input_snapshots_run_id_input_digest_key" ON "run_input_snapshots"("run_id", "input_digest");
CREATE UNIQUE INDEX "run_input_snapshot_run_identity_key" ON "run_input_snapshots"("run_id", "input_digest", "silo_id", "agent_service_id", "agent_revision_id", "effective_contract_digest");
CREATE INDEX "run_input_snapshots_agent_service_id_agent_revision_id_idx" ON "run_input_snapshots"("agent_service_id", "agent_revision_id");
CREATE UNIQUE INDEX "workload_assignment_bootstrap_identity_key" ON "workload_assignments"("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "audience", "service_account_name", "namespace", "workload_kind", "workload_uid");
CREATE UNIQUE INDEX "workload_assignment_action_identity_key" ON "workload_assignments"("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "service_account_name", "namespace", "workload_kind", "workload_uid");
CREATE UNIQUE INDEX "workload_assignments_run_attempt_workload_key" ON "workload_assignments"("run_id", "attempt", "workload_kind", "workload_uid");
CREATE UNIQUE INDEX "workload_assignments_run_attempt_workload_pod_key" ON "workload_assignments"("run_id", "attempt", "workload_kind", "workload_uid", "pod_uid");
CREATE UNIQUE INDEX "workload_assignments_namespace_workload_kind_workload_uid_key" ON "workload_assignments"("namespace", "workload_kind", "workload_uid");
CREATE UNIQUE INDEX "workload_assignments_namespace_pod_uid_key" ON "workload_assignments"("namespace", "pod_uid");
CREATE INDEX "workload_assignments_silo_id_subject_id_idx" ON "workload_assignments"("silo_id", "subject_id");
CREATE INDEX "workload_assignments_state_expires_at_idx" ON "workload_assignments"("state", "expires_at");
CREATE UNIQUE INDEX "workload_bootstraps_claim_digest_key" ON "workload_bootstraps"("claim_digest");
CREATE UNIQUE INDEX "workload_bootstraps_receipt_id_key" ON "workload_bootstraps"("receipt_id");
CREATE UNIQUE INDEX "workload_bootstraps_run_id_attempt_key" ON "workload_bootstraps"("run_id", "attempt");
CREATE UNIQUE INDEX "workload_bootstrap_assignment_identity_key" ON "workload_bootstraps"("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "audience", "service_account_name", "namespace", "workload_kind", "workload_uid");
CREATE INDEX "workload_bootstraps_expires_at_idx" ON "workload_bootstraps"("expires_at");
CREATE UNIQUE INDEX "run_proof_keys_key_thumbprint_key" ON "run_proof_keys"("key_thumbprint");
CREATE UNIQUE INDEX "run_proof_keys_bootstrap_id_key" ON "run_proof_keys"("bootstrap_id");
CREATE UNIQUE INDEX "run_proof_keys_run_id_attempt_key" ON "run_proof_keys"("run_id", "attempt");
CREATE UNIQUE INDEX "run_proof_keys_run_id_attempt_workload_kind_workload_uid_key" ON "run_proof_keys"("run_id", "attempt", "workload_kind", "workload_uid");
CREATE UNIQUE INDEX "run_proof_keys_run_id_attempt_workload_kind_workload_uid_pod_uid_key" ON "run_proof_keys"("run_id", "attempt", "workload_kind", "workload_uid", "pod_uid");
CREATE UNIQUE INDEX "run_proof_keys_id_run_id_attempt_key" ON "run_proof_keys"("id", "run_id", "attempt");
CREATE UNIQUE INDEX "run_proof_key_bound_thumbprint_key" ON "run_proof_keys"("id", "run_id", "attempt", "key_thumbprint");
CREATE UNIQUE INDEX "run_proof_key_bound_pod_key" ON "run_proof_keys"("id", "run_id", "attempt", "workload_kind", "workload_uid", "key_thumbprint", "pod_uid");
CREATE INDEX "run_proof_keys_pod_uid_idx" ON "run_proof_keys"("pod_uid");
CREATE INDEX "run_proof_keys_expires_at_idx" ON "run_proof_keys"("expires_at");
CREATE UNIQUE INDEX "run_outbox_events_idempotency_key_key" ON "run_outbox_events"("idempotency_key");
CREATE UNIQUE INDEX "run_outbox_events_run_id_sequence_key" ON "run_outbox_events"("run_id", "sequence");
CREATE INDEX "run_outbox_events_published_at_available_at_idx" ON "run_outbox_events"("published_at", "available_at");

ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_revision_fkey" FOREIGN KEY ("agent_service_id", "agent_revision_id") REFERENCES "agent_revisions"("agent_service_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_service_silo_fkey" FOREIGN KEY ("agent_service_id", "silo_id") REFERENCES "agent_services"("id", "silo_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "run_input_snapshots" ADD CONSTRAINT "run_input_snapshots_run_digest_fkey" FOREIGN KEY ("run_id", "input_digest", "silo_id", "agent_service_id", "agent_revision_id", "effective_contract_digest") REFERENCES "agent_runs"("id", "input_snapshot_digest", "silo_id", "agent_service_id", "agent_revision_id", "effective_contract_digest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workload_assignments" ADD CONSTRAINT "workload_assignments_run_identity_fkey" FOREIGN KEY ("run_id", "silo_id", "agent_service_id", "agent_revision_id") REFERENCES "agent_runs"("id", "silo_id", "agent_service_id", "agent_revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workload_bootstraps" ADD CONSTRAINT "workload_bootstraps_assignment_identity_fkey" FOREIGN KEY ("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "audience", "service_account_name", "namespace", "workload_kind", "workload_uid") REFERENCES "workload_assignments"("run_id", "attempt", "agent_service_id", "agent_revision_id", "silo_id", "subject_id", "audience", "service_account_name", "namespace", "workload_kind", "workload_uid") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "run_proof_keys" ADD CONSTRAINT "run_proof_keys_run_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "run_proof_keys" ADD CONSTRAINT "run_proof_keys_assignment_fkey" FOREIGN KEY ("run_id", "attempt", "workload_kind", "workload_uid", "pod_uid") REFERENCES "workload_assignments"("run_id", "attempt", "workload_kind", "workload_uid", "pod_uid") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "run_proof_keys" ADD CONSTRAINT "run_proof_keys_bootstrap_id_fkey" FOREIGN KEY ("bootstrap_id") REFERENCES "workload_bootstraps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "run_outbox_events" ADD CONSTRAINT "run_outbox_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_current_workload_assignment_attempt"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    run_state "AgentRunState";
BEGIN
    SELECT "state" INTO run_state
    FROM "agent_runs"
    WHERE "id" = NEW."run_id" AND "attempt" = NEW."attempt"
    FOR UPDATE;
    IF run_state IS DISTINCT FROM 'queued'::"AgentRunState" THEN
        RAISE EXCEPTION 'workload assignment must target the current Queued attempt';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "workload_assignments_current_attempt" BEFORE INSERT OR UPDATE OF "run_id", "attempt" ON "workload_assignments" FOR EACH ROW EXECUTE FUNCTION "enforce_current_workload_assignment_attempt"();

CREATE FUNCTION "enforce_accepted_outbox_attempt"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "agent_runs" WHERE "id" = NEW."run_id" AND "attempt" >= NEW."attempt") THEN
        RAISE EXCEPTION 'outbox event attempt has not been accepted';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "run_outbox_events_accepted_attempt" BEFORE INSERT OR UPDATE OF "run_id", "attempt" ON "run_outbox_events" FOR EACH ROW EXECUTE FUNCTION "enforce_accepted_outbox_attempt"();

CREATE FUNCTION "reject_run_input_snapshot_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'RunInputSnapshot rows are immutable';
END;
$$;
CREATE TRIGGER "run_input_snapshots_immutable" BEFORE UPDATE OR DELETE ON "run_input_snapshots" FOR EACH ROW EXECUTE FUNCTION "reject_run_input_snapshot_mutation"();

CREATE FUNCTION "enforce_initial_agent_run_state"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."attempt" <> 1 OR NEW."state" <> 'accepted'
        OR NEW."started_at" IS NOT NULL OR NEW."finished_at" IS NOT NULL
        OR NEW."terminal_reason" IS NOT NULL OR NEW."cost_amount" IS NOT NULL
        OR NEW."cost_currency" IS NOT NULL THEN
        RAISE EXCEPTION 'a new AgentRun must begin as accepted attempt 1';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_runs_initial_state"
    BEFORE INSERT ON "agent_runs"
    FOR EACH ROW EXECUTE FUNCTION "enforce_initial_agent_run_state"();

CREATE FUNCTION "enforce_current_agent_run_authority"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    service_state "AgentServiceState";
    service_silo_id TEXT;
    current_revision_id TEXT;
    revision_state "AgentRevisionState";
BEGIN
    SELECT "state", "silo_id", "active_revision_id"
    INTO service_state, service_silo_id, current_revision_id
    FROM "agent_services"
    WHERE "id" = NEW."agent_service_id"
    FOR UPDATE;

    IF service_state IS DISTINCT FROM 'active'::"AgentServiceState"
        OR service_silo_id IS DISTINCT FROM NEW."silo_id"
        OR current_revision_id IS DISTINCT FROM NEW."agent_revision_id" THEN
        RAISE EXCEPTION 'AgentRun requires the exact silo and active revision of an Active AgentService';
    END IF;

    SELECT "state"
    INTO revision_state
    FROM "agent_revisions"
    WHERE "id" = NEW."agent_revision_id"
      AND "agent_service_id" = NEW."agent_service_id"
    FOR UPDATE;

    IF revision_state IS DISTINCT FROM 'published'::"AgentRevisionState" THEN
        RAISE EXCEPTION 'AgentRun requires the exact active revision to remain Published';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_runs_current_authority"
    BEFORE INSERT OR UPDATE OF "attempt" ON "agent_runs"
    FOR EACH ROW EXECUTE FUNCTION "enforce_current_agent_run_authority"();

CREATE FUNCTION "enforce_agent_run_authority_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id"
        OR NEW."agent_service_id" IS DISTINCT FROM OLD."agent_service_id"
        OR NEW."agent_revision_id" IS DISTINCT FROM OLD."agent_revision_id"
        OR NEW."thread_id" IS DISTINCT FROM OLD."thread_id"
        OR NEW."trigger" IS DISTINCT FROM OLD."trigger"
        OR NEW."delegated_user_id" IS DISTINCT FROM OLD."delegated_user_id"
        OR NEW."request_idempotency_key" IS DISTINCT FROM OLD."request_idempotency_key"
        OR NEW."root_run_id" IS DISTINCT FROM OLD."root_run_id"
        OR NEW."parent_run_id" IS DISTINCT FROM OLD."parent_run_id"
        OR NEW."effective_contract_digest" IS DISTINCT FROM OLD."effective_contract_digest"
        OR NEW."input_snapshot_digest" IS DISTINCT FROM OLD."input_snapshot_digest" THEN
        RAISE EXCEPTION 'AgentRun identity and accepted inputs are immutable';
    END IF;
    IF NEW."attempt" <> OLD."attempt" THEN
        IF NEW."attempt" <> OLD."attempt" + 1 OR OLD."state" NOT IN ('failed', 'cancelled')
            OR NEW."state" <> 'accepted' OR NEW."accepted_at" <= OLD."accepted_at"
            OR NEW."started_at" IS NOT NULL OR NEW."finished_at" IS NOT NULL
            OR NEW."terminal_reason" IS NOT NULL OR NEW."cost_amount" IS NOT NULL
            OR NEW."cost_currency" IS NOT NULL THEN
            RAISE EXCEPTION 'invalid AgentRun attempt transition';
        END IF;
    ELSE
        IF NEW."accepted_at" IS DISTINCT FROM OLD."accepted_at" THEN
            RAISE EXCEPTION 'accepted_at changes only with a new accepted attempt';
        END IF;
        IF OLD."state" IN ('completed', 'failed', 'cancelled') THEN
            RAISE EXCEPTION 'terminal AgentRun attempt coordinates are immutable';
        END IF;
        IF NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
            (OLD."state" = 'accepted' AND NEW."state" IN ('queued', 'failed', 'cancelled')) OR
            (OLD."state" = 'queued' AND NEW."state" IN ('assigned', 'failed', 'cancelled')) OR
            (OLD."state" = 'assigned' AND NEW."state" IN ('running', 'failed', 'cancelled')) OR
            (OLD."state" = 'running' AND NEW."state" IN ('waiting_for_approval', 'completed', 'failed', 'cancelled')) OR
            (OLD."state" = 'waiting_for_approval' AND NEW."state" IN ('running', 'completed', 'failed', 'cancelled'))
        ) THEN
            RAISE EXCEPTION 'invalid AgentRun state transition';
        END IF;
        IF OLD."started_at" IS NOT NULL AND NEW."started_at" IS DISTINCT FROM OLD."started_at" THEN
            RAISE EXCEPTION 'AgentRun started_at is immutable once recorded';
        END IF;
        IF OLD."started_at" IS NULL AND NEW."started_at" IS NOT NULL AND NEW."state" <> 'running' THEN
            RAISE EXCEPTION 'AgentRun started_at may be recorded only when entering running';
        END IF;
        IF NEW."state" = 'running' AND NEW."started_at" IS NULL THEN
            RAISE EXCEPTION 'a running AgentRun requires started_at';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_runs_authority_update" BEFORE UPDATE ON "agent_runs" FOR EACH ROW EXECUTE FUNCTION "enforce_agent_run_authority_update"();

CREATE FUNCTION "enforce_workload_bootstrap_consumption"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    assignment_pod_uid TEXT;
    assignment_state "WorkloadAssignmentState";
    run_state "AgentRunState";
    transition_time TIMESTAMP(3) := clock_timestamp();
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."consumed_at" IS NOT NULL OR NEW."consumed_by_pod_uid" IS NOT NULL OR NEW."receipt_id" IS NOT NULL THEN
            RAISE EXCEPTION 'a new WorkloadBootstrap must begin unconsumed';
        END IF;
        SELECT "state" INTO run_state
        FROM "agent_runs"
        WHERE "id" = NEW."run_id" AND "attempt" = NEW."attempt"
        FOR UPDATE;
        IF run_state IS DISTINCT FROM 'assigned'::"AgentRunState" THEN
            RAISE EXCEPTION 'a new WorkloadBootstrap requires the current Assigned attempt';
        END IF;
        SELECT "state" INTO assignment_state
        FROM "workload_assignments"
        WHERE "run_id" = NEW."run_id" AND "attempt" = NEW."attempt"
          AND "agent_service_id" = NEW."agent_service_id"
          AND "agent_revision_id" = NEW."agent_revision_id"
          AND "silo_id" = NEW."silo_id" AND "subject_id" = NEW."subject_id"
          AND "audience" = NEW."audience"
          AND "service_account_name" = NEW."service_account_name"
          AND "namespace" = NEW."namespace" AND "workload_kind" = NEW."workload_kind"
          AND "workload_uid" = NEW."workload_uid"
        FOR UPDATE;
        IF assignment_state IS DISTINCT FROM 'pending_pod'::"WorkloadAssignmentState" THEN
            RAISE EXCEPTION 'a new WorkloadBootstrap requires its PendingPod assignment';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'WorkloadBootstrap rows cannot be deleted'; END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."run_id" IS DISTINCT FROM OLD."run_id"
        OR NEW."attempt" IS DISTINCT FROM OLD."attempt"
        OR NEW."agent_service_id" IS DISTINCT FROM OLD."agent_service_id"
        OR NEW."agent_revision_id" IS DISTINCT FROM OLD."agent_revision_id"
        OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id" OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id"
        OR NEW."audience" IS DISTINCT FROM OLD."audience"
        OR NEW."service_account_name" IS DISTINCT FROM OLD."service_account_name"
        OR NEW."namespace" IS DISTINCT FROM OLD."namespace"
        OR NEW."workload_kind" IS DISTINCT FROM OLD."workload_kind"
        OR NEW."workload_uid" IS DISTINCT FROM OLD."workload_uid"
        OR NEW."claim_digest" IS DISTINCT FROM OLD."claim_digest"
        OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'WorkloadBootstrap identity is immutable';
    END IF;
    IF OLD."consumed_at" IS NOT NULL OR NEW."consumed_at" IS NULL
        OR NEW."consumed_by_pod_uid" IS NULL OR NEW."receipt_id" IS NULL THEN
        RAISE EXCEPTION 'WorkloadBootstrap may be consumed exactly once';
    END IF;
    IF NEW."consumed_at" < OLD."created_at" OR NEW."consumed_at" > transition_time
        OR NEW."consumed_at" >= OLD."expires_at" OR transition_time >= OLD."expires_at" THEN
        RAISE EXCEPTION 'WorkloadBootstrap must be consumed at a current time before expiry';
    END IF;
    SELECT "state", "pod_uid" INTO assignment_state, assignment_pod_uid
    FROM "workload_assignments"
    WHERE "run_id" = NEW."run_id" AND "attempt" = NEW."attempt"
    FOR UPDATE;
    IF assignment_state IS DISTINCT FROM 'registered'::"WorkloadAssignmentState"
        OR assignment_pod_uid IS DISTINCT FROM NEW."consumed_by_pod_uid" THEN
        RAISE EXCEPTION 'bootstrap consumer Pod is not the registered assignment Pod';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "workload_bootstraps_single_use" BEFORE INSERT OR UPDATE OR DELETE ON "workload_bootstraps" FOR EACH ROW EXECUTE FUNCTION "enforce_workload_bootstrap_consumption"();

CREATE FUNCTION "enforce_run_proof_key_bootstrap"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "workload_bootstraps" WHERE "id" = NEW."bootstrap_id"
        AND "run_id" = NEW."run_id" AND "attempt" = NEW."attempt"
        AND "consumed_at" IS NOT NULL AND "consumed_by_pod_uid" = NEW."pod_uid"
    ) THEN
        RAISE EXCEPTION 'RunProofKey requires the consumed bootstrap for the exact run, attempt, and Pod';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "run_proof_keys_consumed_bootstrap" BEFORE INSERT ON "run_proof_keys" FOR EACH ROW EXECUTE FUNCTION "enforce_run_proof_key_bootstrap"();

CREATE FUNCTION "enforce_workload_assignment_update"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    transition_time TIMESTAMP(3) := clock_timestamp();
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."state" <> 'pending_pod' OR NEW."pod_uid" IS NOT NULL
            OR NEW."registered_at" IS NOT NULL OR NEW."revoked_at" IS NOT NULL THEN
            RAISE EXCEPTION 'a new WorkloadAssignment must begin pending_pod';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'WorkloadAssignment rows cannot be deleted'; END IF;
    IF NEW."run_id" IS DISTINCT FROM OLD."run_id" OR NEW."attempt" IS DISTINCT FROM OLD."attempt"
        OR NEW."agent_service_id" IS DISTINCT FROM OLD."agent_service_id"
        OR NEW."agent_revision_id" IS DISTINCT FROM OLD."agent_revision_id"
        OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id" OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id"
        OR NEW."audience" IS DISTINCT FROM OLD."audience"
        OR NEW."service_account_name" IS DISTINCT FROM OLD."service_account_name"
        OR NEW."namespace" IS DISTINCT FROM OLD."namespace"
        OR NEW."workload_kind" IS DISTINCT FROM OLD."workload_kind"
        OR NEW."workload_uid" IS DISTINCT FROM OLD."workload_uid"
        OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'WorkloadAssignment identity is immutable';
    END IF;
    IF OLD."state" = 'revoked' OR NEW."state" = OLD."state"
        OR (OLD."state" = 'registered' AND NEW."state" <> 'revoked')
        OR (OLD."state" = 'pending_pod' AND NEW."state" NOT IN ('registered', 'revoked')) THEN
        RAISE EXCEPTION 'invalid WorkloadAssignment state transition';
    END IF;
    IF OLD."state" = 'pending_pod' AND NEW."state" = 'registered' AND (
        NEW."pod_uid" IS NULL OR NEW."registered_at" IS NULL OR NEW."revoked_at" IS NOT NULL
        OR NEW."registered_at" < OLD."created_at" OR NEW."registered_at" > transition_time
    ) THEN
        RAISE EXCEPTION 'registration must bind the current Pod and registration time';
    END IF;
    IF OLD."state" = 'pending_pod' AND NEW."state" = 'revoked' AND (
        NEW."pod_uid" IS NOT NULL OR NEW."registered_at" IS NOT NULL OR NEW."revoked_at" IS NULL
        OR NEW."revoked_at" < OLD."created_at" OR NEW."revoked_at" > transition_time
    ) THEN
        RAISE EXCEPTION 'an unregistered WorkloadAssignment must revoke without Pod registration';
    END IF;
    IF OLD."state" = 'registered' AND (
        NEW."pod_uid" IS DISTINCT FROM OLD."pod_uid"
        OR NEW."registered_at" IS DISTINCT FROM OLD."registered_at"
        OR NEW."revoked_at" IS NULL OR NEW."revoked_at" < OLD."registered_at"
        OR NEW."revoked_at" > transition_time
    ) THEN
        RAISE EXCEPTION 'registered WorkloadAssignment Pod UID is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "workload_assignments_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "workload_assignments" FOR EACH ROW EXECUTE FUNCTION "enforce_workload_assignment_update"();

CREATE FUNCTION "enforce_run_proof_key_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'RunProofKey rows cannot be deleted'; END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."bootstrap_id" IS DISTINCT FROM OLD."bootstrap_id"
        OR NEW."run_id" IS DISTINCT FROM OLD."run_id" OR NEW."attempt" IS DISTINCT FROM OLD."attempt"
        OR NEW."workload_kind" IS DISTINCT FROM OLD."workload_kind"
        OR NEW."workload_uid" IS DISTINCT FROM OLD."workload_uid" OR NEW."pod_uid" IS DISTINCT FROM OLD."pod_uid"
        OR NEW."public_key_jwk" IS DISTINCT FROM OLD."public_key_jwk"
        OR NEW."key_thumbprint" IS DISTINCT FROM OLD."key_thumbprint"
        OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'RunProofKey binding is immutable';
    END IF;
    IF OLD."revoked_at" IS NOT NULL OR NEW."revoked_at" IS NULL THEN
        RAISE EXCEPTION 'RunProofKey may be revoked exactly once';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "run_proof_keys_immutable" BEFORE UPDATE OR DELETE ON "run_proof_keys" FOR EACH ROW EXECUTE FUNCTION "enforce_run_proof_key_update"();

CREATE FUNCTION "enforce_run_outbox_event_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'OutboxEvent rows cannot be deleted';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."run_id" IS DISTINCT FROM OLD."run_id"
        OR NEW."attempt" IS DISTINCT FROM OLD."attempt" OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
        OR NEW."kind" IS DISTINCT FROM OLD."kind"
        OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
        OR NEW."payload" IS DISTINCT FROM OLD."payload"
        OR NEW."available_at" IS DISTINCT FROM OLD."available_at"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'OutboxEvent identity, order, and payload are immutable';
    END IF;
    IF OLD."published_at" IS NOT NULL OR OLD."failed_at" IS NOT NULL THEN
        RAISE EXCEPTION 'delivered OutboxEvent status is terminal';
    END IF;
    IF OLD."claimed_at" IS NOT NULL AND (
        NEW."claimed_at" IS NULL OR NEW."claimed_at" < OLD."claimed_at"
    ) THEN
        RAISE EXCEPTION 'OutboxEvent claim time cannot move backward or be erased';
    END IF;
    IF NEW."claimed_at" IS DISTINCT FROM OLD."claimed_at" THEN
        IF NEW."claimed_at" IS NULL OR NEW."delivery_count" <> OLD."delivery_count" + 1 THEN
            RAISE EXCEPTION 'each OutboxEvent claim must advance delivery_count exactly once';
        END IF;
    ELSIF NEW."delivery_count" <> OLD."delivery_count" THEN
        RAISE EXCEPTION 'OutboxEvent delivery_count advances only with a new claim';
    END IF;
    IF OLD."published_at" IS NOT NULL AND NEW."published_at" IS DISTINCT FROM OLD."published_at" THEN
        RAISE EXCEPTION 'OutboxEvent publication evidence is immutable';
    END IF;
    IF OLD."failed_at" IS NOT NULL AND (
        NEW."failed_at" IS DISTINCT FROM OLD."failed_at"
        OR NEW."failure_code" IS DISTINCT FROM OLD."failure_code"
    ) THEN
        RAISE EXCEPTION 'OutboxEvent failure evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "run_outbox_events_monotonic"
    BEFORE UPDATE OR DELETE ON "run_outbox_events"
    FOR EACH ROW EXECUTE FUNCTION "enforce_run_outbox_event_update"();
