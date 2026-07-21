-- Driving domain: runtime (libs/backend/agents/runtime/main), Phase E slice 3.
-- Cross-domain: also touches the authorization domain (libs/backend/server/iam/authorization/main)
-- because the runtime external-action authority reserves a ToolInvocation before dispatch and the
-- deferred-tool approval lifecycle extends the existing ApprovalRequest. Adds: the durable
-- ToolInvocation reserve/execute/complete receipt, the ordered steering-boundary ledger, and the
-- per-attempt input generation. (The runtime checkpoint is a local encrypted file, not a DB model.)

-- CreateEnum
CREATE TYPE "RuntimeSteeringDisposition" AS ENUM ('absorbed', 'deferred');

-- AlterTable (runtime domain): per-attempt input generation advanced when steering is absorbed.
ALTER TABLE "runtime_command_streams" ADD COLUMN "input_generation" INTEGER NOT NULL DEFAULT 0;

-- AlterTable (runtime domain): persist a resume frame's authorized deferred-result payload so an
-- idempotent redelivery is byte-identical even after the single-use resume token is consumed.
ALTER TABLE "runtime_dispatched_commands" ADD COLUMN "payload" JSONB;

-- AlterTable (authorization domain): link a pending approval to its deferred tool invocation and
-- carry the authorized deferred result that a resume feeds back into the loop.
ALTER TABLE "approval_requests" ADD COLUMN "tool_invocation_row_id" TEXT;
ALTER TABLE "approval_requests" ADD COLUMN "deferred_tool_result" JSONB;

-- AlterTable (authorization domain): a deferred-tool approval has no capability-catalog entry, so the
-- catalog binding becomes optional; the capability-proof approval path fills it when it lands.
ALTER TABLE "approval_requests" ALTER COLUMN "catalog_id" DROP NOT NULL;
ALTER TABLE "approval_requests" ALTER COLUMN "catalog_revision" DROP NOT NULL;
ALTER TABLE "approval_requests" ALTER COLUMN "catalog_digest" DROP NOT NULL;
ALTER TABLE "approval_requests" ALTER COLUMN "capability_id" DROP NOT NULL;

-- AlterTable (mcp domain): flag whether invoking a server's tools requires a deferred human approval.
ALTER TABLE "mcp_servers" ADD COLUMN "requires_approval" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable (authorization domain): external tool invocation receipt.
CREATE TABLE "tool_invocations" (
    "id" TEXT NOT NULL,
    "silo_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "agent_service_id" TEXT NOT NULL,
    "agent_revision_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "tool_revision_id" TEXT NOT NULL,
    "tool_invocation_id" TEXT NOT NULL,
    "arguments_digest" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "state" "ActionExecutionState" NOT NULL DEFAULT 'reserved',
    "result" JSONB,
    "failure_code" TEXT,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tool_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable (runtime domain): ordered steering-boundary ledger, exactly-once per boundary.
CREATE TABLE "runtime_steering_boundaries" (
    "run_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "boundary_id" TEXT NOT NULL,
    "from_input_generation" INTEGER NOT NULL,
    "to_input_generation" INTEGER NOT NULL,
    "disposition" "RuntimeSteeringDisposition" NOT NULL,
    "steering_digest" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acked_at" TIMESTAMP(3),

    CONSTRAINT "runtime_steering_boundaries_pkey" PRIMARY KEY ("run_id","attempt","boundary_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tool_invocations_request_fingerprint_key" ON "tool_invocations"("request_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "tool_invocations_run_id_attempt_tool_invocation_id_key" ON "tool_invocations"("run_id", "attempt", "tool_invocation_id");

-- CreateIndex
CREATE INDEX "tool_invocations_run_id_attempt_state_idx" ON "tool_invocations"("run_id", "attempt", "state");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_steering_boundaries_run_id_attempt_to_input_generat_key" ON "runtime_steering_boundaries"("run_id", "attempt", "to_input_generation");

-- CreateIndex
CREATE INDEX "runtime_steering_boundaries_run_id_attempt_idx" ON "runtime_steering_boundaries"("run_id", "attempt");

-- AddForeignKey
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_run_id_agent_service_id_agent_revision_id_fkey" FOREIGN KEY ("run_id", "agent_service_id", "agent_revision_id") REFERENCES "agent_runs"("id", "agent_service_id", "agent_revision_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tool_invocation_row_id_fkey" FOREIGN KEY ("tool_invocation_row_id") REFERENCES "tool_invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
