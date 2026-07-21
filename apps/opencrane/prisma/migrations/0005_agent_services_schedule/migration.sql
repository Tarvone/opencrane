-- Driving domain: agent-services (libs/backend/server/agents/agent-services/main), Phase E slice 6.
-- Adds the recurring schedule shape for managed AgentServices (#129/#332):
--   * AgentScheduleOverlapPolicy enum (skip | allow) — behaviour when a prior scheduled run of the
--     same service is still active.
--   * agent_service_schedules — cron + IANA timezone + overlap policy + enabled + a bounded
--     catch-up horizon and the last-admitted slot. The scheduler (composed inside the control API,
--     no new workload) evaluates these and admits due slots through the EXISTING run-admission path
--     with a deterministic idempotency key; the schedule row itself never dispatches or executes.
-- No dual-write and no second run-creation path: schedules only feed the existing AgentRun
-- admission via ManagedRunAdmissionPort with trigger `schedule`.

-- CreateEnum
CREATE TYPE "AgentScheduleOverlapPolicy" AS ENUM ('skip', 'allow');

-- CreateTable
CREATE TABLE "agent_service_schedules" (
    "id" TEXT NOT NULL,
    "silo_id" TEXT NOT NULL,
    "agent_service_id" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "overlap_policy" "AgentScheduleOverlapPolicy" NOT NULL DEFAULT 'skip',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "catchup_window_seconds" INTEGER NOT NULL DEFAULT 3600,
    "last_scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_service_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_service_schedules_silo_id_agent_service_id_idx" ON "agent_service_schedules"("silo_id", "agent_service_id");

-- CreateIndex
CREATE INDEX "agent_service_schedules_enabled_idx" ON "agent_service_schedules"("enabled");

-- AddForeignKey
ALTER TABLE "agent_service_schedules" ADD CONSTRAINT "agent_service_schedules_agent_service_id_silo_id_fkey" FOREIGN KEY ("agent_service_id", "silo_id") REFERENCES "agent_services"("id", "silo_id") ON DELETE RESTRICT ON UPDATE CASCADE;
