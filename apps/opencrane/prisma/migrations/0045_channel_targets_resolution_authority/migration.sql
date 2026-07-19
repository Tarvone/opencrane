-- Fresh target-resolution authority. No legacy gateway/OpenClaw route or session data is copied.

CREATE TYPE "ChannelInvocationAction" AS ENUM ('command.forward', 'events.read');

CREATE TABLE "channel_runtime_routes" (
  "id" TEXT NOT NULL,
  "silo_id" TEXT NOT NULL,
  "agent_service_id" TEXT NOT NULL,
  "action" "ChannelInvocationAction" NOT NULL,
  "endpoint" TEXT NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT TRUE,
  "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),

  CONSTRAINT "channel_runtime_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "channel_runtime_routes_endpoint_nonempty" CHECK (length(btrim("endpoint")) > 0),
  CONSTRAINT "channel_runtime_routes_expiry_after_registration" CHECK ("expires_at" > "registered_at"),
  CONSTRAINT "channel_runtime_routes_service_fkey" FOREIGN KEY ("agent_service_id", "silo_id") REFERENCES "agent_services"("id", "silo_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "channel_runtime_routes_exact_target_key" ON "channel_runtime_routes"("id", "silo_id", "agent_service_id", "action");
CREATE INDEX "channel_runtime_routes_current_lookup_idx" ON "channel_runtime_routes"("silo_id", "agent_service_id", "action", "is_current", "expires_at");
CREATE UNIQUE INDEX "channel_runtime_routes_one_current_target" ON "channel_runtime_routes"("silo_id", "agent_service_id", "action") WHERE "is_current" = TRUE AND "revoked_at" IS NULL;

-- Driving-domain composite key: invocation contexts must bind a command run to the exact
-- thread, silo, service, and delegated subject rather than relying on scalar run_id alone.
CREATE UNIQUE INDEX "agent_runs_channel_context_identity_key" ON "agent_runs"("id", "thread_id", "silo_id", "agent_service_id", "delegated_user_id");

CREATE TABLE "channel_invocation_contexts" (
  "id" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "silo_id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "agent_service_id" TEXT NOT NULL,
  "action" "ChannelInvocationAction" NOT NULL,
  "route_id" TEXT NOT NULL,
  "run_id" TEXT,
  "membership_revision" INTEGER NOT NULL,
  "authorization_digest" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "channel_invocation_contexts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "channel_invocation_contexts_digest_key" UNIQUE ("digest"),
  CONSTRAINT "channel_invocation_contexts_digest_format" CHECK ("digest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "channel_invocation_contexts_membership_revision_positive" CHECK ("membership_revision" > 0),
  CONSTRAINT "channel_invocation_contexts_expiry_after_creation" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "channel_invocation_contexts_action_run_binding" CHECK (("action" = 'command.forward' AND "run_id" IS NOT NULL) OR ("action" = 'events.read' AND "run_id" IS NULL)),
  CONSTRAINT "channel_invocation_contexts_route_fkey" FOREIGN KEY ("route_id", "silo_id", "agent_service_id", "action") REFERENCES "channel_runtime_routes"("id", "silo_id", "agent_service_id", "action") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "channel_invocation_contexts_thread_fkey" FOREIGN KEY ("thread_id", "silo_id", "agent_service_id") REFERENCES "conversation_threads"("id", "silo_id", "agent_service_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "channel_invocation_contexts_participant_fkey" FOREIGN KEY ("thread_id", "subject_id") REFERENCES "conversation_participants"("thread_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "channel_invocation_contexts_run_fkey" FOREIGN KEY ("run_id", "thread_id", "silo_id", "agent_service_id", "subject_id") REFERENCES "agent_runs"("id", "thread_id", "silo_id", "agent_service_id", "delegated_user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "channel_invocation_contexts_digest_expiry_idx" ON "channel_invocation_contexts"("digest", "expires_at");
CREATE INDEX "channel_invocation_contexts_route_expiry_idx" ON "channel_invocation_contexts"("route_id", "expires_at");
CREATE INDEX "channel_invocation_contexts_subject_thread_idx" ON "channel_invocation_contexts"("subject_id", "silo_id", "thread_id", "created_at");
