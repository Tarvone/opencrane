-- Driving domain: runtime (libs/backend/agents/runtime/main). Adds the durable command-stream
-- authority that the Prisma runtime dispatch adapter advances monotonically per run attempt.

-- CreateEnum
CREATE TYPE "RuntimeCommandKind" AS ENUM ('start_attempt', 'resume_attempt', 'cancel_attempt');

-- CreateTable
CREATE TABLE "runtime_command_streams" (
    "run_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "fence" INTEGER NOT NULL DEFAULT 1,
    "runtime_instance_id" TEXT,
    "next_command_sequence" INTEGER NOT NULL DEFAULT 1,
    "accepted_candidate_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runtime_command_streams_pkey" PRIMARY KEY ("run_id","attempt")
);

-- CreateTable
CREATE TABLE "runtime_dispatched_commands" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "command_id" TEXT NOT NULL,
    "kind" "RuntimeCommandKind" NOT NULL,
    "fence" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_dispatched_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "runtime_dispatched_commands_command_id_key" ON "runtime_dispatched_commands"("command_id");

-- CreateIndex
CREATE INDEX "runtime_dispatched_commands_run_id_attempt_idx" ON "runtime_dispatched_commands"("run_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_dispatched_commands_run_id_attempt_sequence_key" ON "runtime_dispatched_commands"("run_id", "attempt", "sequence");

-- AddForeignKey
ALTER TABLE "runtime_dispatched_commands" ADD CONSTRAINT "runtime_dispatched_commands_run_id_attempt_fkey" FOREIGN KEY ("run_id", "attempt") REFERENCES "runtime_command_streams"("run_id", "attempt") ON DELETE RESTRICT ON UPDATE CASCADE;
