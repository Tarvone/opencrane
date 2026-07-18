-- Conversations-owned canonical transcript. Fresh target tables only; no transcript is copied.
CREATE TYPE "ConversationThreadState" AS ENUM ('active', 'archived');
CREATE TYPE "ConversationMessageRole" AS ENUM ('user', 'assistant', 'tool', 'system');
CREATE TYPE "ConversationMessageState" AS ENUM ('pending', 'streaming', 'completed', 'failed', 'cancelled');

CREATE TABLE "conversation_threads" (
    "id" TEXT NOT NULL,
    "silo_id" TEXT NOT NULL,
    "agent_service_id" TEXT NOT NULL,
    "state" "ConversationThreadState" NOT NULL DEFAULT 'active',
    "context_revision_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversation_threads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_threads_identity_check" CHECK (btrim("silo_id") <> '' AND btrim("agent_service_id") <> '')
);

CREATE TABLE "conversation_participants" (
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("thread_id", "user_id"),
    CONSTRAINT "conversation_participants_user_check" CHECK (btrim("user_id") <> '')
);

CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "run_id" TEXT,
    "user_id" TEXT,
    "role" "ConversationMessageRole" NOT NULL,
    "state" "ConversationMessageState" NOT NULL,
    "source" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_messages_source_check" CHECK ("source" IN ('user_input', 'model_output', 'tool_result', 'platform')),
    CONSTRAINT "conversation_messages_blocks_check" CHECK (jsonb_typeof("blocks") = 'array'),
    CONSTRAINT "conversation_messages_provenance_check" CHECK (
        ("source" = 'user_input' AND "user_id" IS NOT NULL AND "run_id" IS NULL) OR
        ("source" <> 'user_input' AND "user_id" IS NULL)
    ),
    CONSTRAINT "conversation_messages_completion_check" CHECK (
        ("state" IN ('pending', 'streaming') AND "completed_at" IS NULL) OR
        ("state" IN ('completed', 'failed', 'cancelled') AND "completed_at" IS NOT NULL)
    )
);

CREATE TABLE "conversation_run_events" (
    "run_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_run_events_pkey" PRIMARY KEY ("run_id", "sequence"),
    CONSTRAINT "conversation_run_events_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "conversation_run_events_type_check" CHECK ("type" IN (
        'run.accepted', 'run.started', 'message.started', 'message.delta', 'message.completed',
        'tool.requested', 'tool.approval_required', 'tool.started', 'tool.progress', 'tool.completed',
        'context.compaction_started', 'context.compaction_completed', 'run.usage',
        'run.completed', 'run.failed', 'run.cancelled'
    )),
    CONSTRAINT "conversation_run_events_payload_check" CHECK (jsonb_typeof("payload") = 'object')
);

CREATE TABLE "conversation_context_revisions" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "through_message_id" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "created_by_run_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_context_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_context_revisions_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "conversation_context_revisions_digest_check" CHECK ("digest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "conversation_context_revisions_summary_check" CHECK (jsonb_typeof("summary") = 'object')
);

CREATE UNIQUE INDEX "conversation_threads_id_silo_id_key" ON "conversation_threads"("id", "silo_id");
CREATE UNIQUE INDEX "conversation_threads_exact_service_key" ON "conversation_threads"("id", "silo_id", "agent_service_id");
CREATE UNIQUE INDEX "conversation_threads_id_context_revision_id_key" ON "conversation_threads"("id", "context_revision_id");
CREATE INDEX "conversation_threads_silo_id_agent_service_id_state_idx" ON "conversation_threads"("silo_id", "agent_service_id", "state");
CREATE INDEX "conversation_participants_user_id_thread_id_idx" ON "conversation_participants"("user_id", "thread_id");
CREATE INDEX "conversation_messages_thread_id_created_at_id_idx" ON "conversation_messages"("thread_id", "created_at", "id");
CREATE INDEX "conversation_messages_run_id_idx" ON "conversation_messages"("run_id");
CREATE INDEX "conversation_run_events_run_id_occurred_at_idx" ON "conversation_run_events"("run_id", "occurred_at");
CREATE UNIQUE INDEX "conversation_context_revisions_thread_id_revision_key" ON "conversation_context_revisions"("thread_id", "revision");
CREATE UNIQUE INDEX "conversation_context_revisions_thread_id_id_key" ON "conversation_context_revisions"("thread_id", "id");
CREATE INDEX "conversation_context_revisions_created_by_run_id_idx" ON "conversation_context_revisions"("created_by_run_id");

ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_agent_service_id_silo_id_fkey"
    FOREIGN KEY ("agent_service_id", "silo_id") REFERENCES "agent_services"("id", "silo_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_thread_fkey"
    FOREIGN KEY ("thread_id", "silo_id", "agent_service_id") REFERENCES "conversation_threads"("id", "silo_id", "agent_service_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "conversation_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "conversation_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_run_events" ADD CONSTRAINT "conversation_run_events_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_context_revisions" ADD CONSTRAINT "conversation_context_revisions_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "conversation_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_context_revisions" ADD CONSTRAINT "conversation_context_revisions_through_message_id_fkey"
    FOREIGN KEY ("through_message_id") REFERENCES "conversation_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_context_revisions" ADD CONSTRAINT "conversation_context_revisions_created_by_run_id_fkey"
    FOREIGN KEY ("created_by_run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_id_context_revision_id_fkey"
    FOREIGN KEY ("id", "context_revision_id") REFERENCES "conversation_context_revisions"("thread_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_conversation_message_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    thread_silo_id TEXT;
    thread_agent_service_id TEXT;
    run_silo_id TEXT;
    run_agent_service_id TEXT;
    run_thread_id TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ConversationMessage rows cannot be deleted';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."thread_id" IS DISTINCT FROM OLD."thread_id"
            OR NEW."run_id" IS DISTINCT FROM OLD."run_id" OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
            OR NEW."role" IS DISTINCT FROM OLD."role" OR NEW."source" IS DISTINCT FROM OLD."source"
            OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
            RAISE EXCEPTION 'ConversationMessage identity and provenance are immutable';
        END IF;
        IF OLD."state" IN ('completed', 'failed', 'cancelled') OR NOT (
            (OLD."state" = 'pending' AND NEW."state" IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')) OR
            (OLD."state" = 'streaming' AND NEW."state" IN ('streaming', 'completed', 'failed', 'cancelled'))
        ) THEN
            RAISE EXCEPTION 'invalid ConversationMessage lifecycle transition';
        END IF;
    END IF;
    SELECT "silo_id", "agent_service_id" INTO thread_silo_id, thread_agent_service_id
      FROM "conversation_threads" WHERE "id" = NEW."thread_id" FOR UPDATE;
    IF NEW."source" = 'user_input' THEN
        IF NEW."role" <> 'user' OR NEW."user_id" IS NULL OR NEW."run_id" IS NOT NULL THEN
            RAISE EXCEPTION 'user input requires User role and exact user provenance';
        END IF;
    ELSIF NEW."source" = 'model_output' THEN
        IF NEW."role" <> 'assistant' OR NEW."run_id" IS NULL OR NEW."user_id" IS NOT NULL THEN
            RAISE EXCEPTION 'model output requires Assistant role and exact run provenance';
        END IF;
    ELSIF NEW."source" = 'tool_result' THEN
        IF NEW."role" <> 'tool' OR NEW."run_id" IS NULL OR NEW."user_id" IS NOT NULL THEN
            RAISE EXCEPTION 'tool result requires Tool role and exact run provenance';
        END IF;
    ELSIF NEW."role" <> 'system' OR NEW."user_id" IS NOT NULL THEN
        RAISE EXCEPTION 'platform message requires System role';
    END IF;
    IF NEW."run_id" IS NOT NULL THEN
        SELECT "silo_id", "agent_service_id", "thread_id" INTO run_silo_id, run_agent_service_id, run_thread_id
          FROM "agent_runs" WHERE "id" = NEW."run_id" FOR UPDATE;
        IF run_silo_id IS DISTINCT FROM thread_silo_id OR run_agent_service_id IS DISTINCT FROM thread_agent_service_id
            OR run_thread_id IS DISTINCT FROM NEW."thread_id" THEN
            RAISE EXCEPTION 'ConversationMessage run must belong to the exact thread and silo';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "conversation_messages_closed_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "conversation_messages"
    FOR EACH ROW EXECUTE FUNCTION "enforce_conversation_message_lifecycle"();

CREATE FUNCTION "enforce_conversation_run_event_append"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    previous_sequence INTEGER;
    terminal_exists BOOLEAN;
    run_state "AgentRunState";
    run_thread_id TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."run_id", 0));
    SELECT "state", "thread_id" INTO run_state, run_thread_id FROM "agent_runs" WHERE "id" = NEW."run_id" FOR UPDATE;
    IF run_state IS NULL THEN RAISE EXCEPTION 'RunEvent run does not exist'; END IF;
    IF run_thread_id IS NULL THEN RAISE EXCEPTION 'RunEvent requires a conversation-bound AgentRun'; END IF;
    SELECT COALESCE(MAX("sequence"), 0), COALESCE(bool_or("type" IN ('run.completed', 'run.failed', 'run.cancelled')), false)
      INTO previous_sequence, terminal_exists
      FROM "conversation_run_events" WHERE "run_id" = NEW."run_id";
    IF terminal_exists THEN
        RAISE EXCEPTION 'RunEvent stream is terminal';
    END IF;
    IF NEW."sequence" <> previous_sequence + 1 THEN
        RAISE EXCEPTION 'RunEvent sequence must be contiguous';
    END IF;
    IF NEW."type" = 'run.completed' AND run_state <> 'completed' THEN
        RAISE EXCEPTION 'run.completed event requires Completed AgentRun authority';
    ELSIF NEW."type" = 'run.failed' AND run_state <> 'failed' THEN
        RAISE EXCEPTION 'run.failed event requires Failed AgentRun authority';
    ELSIF NEW."type" = 'run.cancelled' AND run_state <> 'cancelled' THEN
        RAISE EXCEPTION 'run.cancelled event requires Cancelled AgentRun authority';
    ELSIF NEW."type" NOT IN ('run.completed', 'run.failed', 'run.cancelled') AND run_state IN ('completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'terminal AgentRun accepts only its matching terminal event';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "conversation_run_events_contiguous" BEFORE INSERT ON "conversation_run_events"
    FOR EACH ROW EXECUTE FUNCTION "enforce_conversation_run_event_append"();

CREATE FUNCTION "reject_conversation_immutable_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'canonical conversation history is immutable';
END;
$$;
CREATE TRIGGER "conversation_run_events_append_only" BEFORE UPDATE OR DELETE ON "conversation_run_events"
    FOR EACH ROW EXECUTE FUNCTION "reject_conversation_immutable_mutation"();
CREATE TRIGGER "conversation_context_revisions_append_only" BEFORE UPDATE OR DELETE ON "conversation_context_revisions"
    FOR EACH ROW EXECUTE FUNCTION "reject_conversation_immutable_mutation"();

CREATE FUNCTION "enforce_conversation_context_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    message_thread_id TEXT;
    run_thread_id TEXT;
BEGIN
    SELECT "thread_id" INTO message_thread_id FROM "conversation_messages" WHERE "id" = NEW."through_message_id" FOR UPDATE;
    SELECT "thread_id" INTO run_thread_id FROM "agent_runs" WHERE "id" = NEW."created_by_run_id" FOR UPDATE;
    IF message_thread_id IS DISTINCT FROM NEW."thread_id" OR run_thread_id IS DISTINCT FROM NEW."thread_id" THEN
        RAISE EXCEPTION 'ConversationContextRevision provenance must belong to the exact thread';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "conversation_context_revisions_exact_provenance" BEFORE INSERT ON "conversation_context_revisions"
    FOR EACH ROW EXECUTE FUNCTION "enforce_conversation_context_provenance"();

CREATE FUNCTION "enforce_terminal_agent_run_event"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    expected_type TEXT;
BEGIN
    IF NEW."thread_id" IS NULL OR NEW."state" NOT IN ('completed', 'failed', 'cancelled') THEN RETURN NULL; END IF;
    expected_type := CASE NEW."state" WHEN 'completed' THEN 'run.completed' WHEN 'failed' THEN 'run.failed' ELSE 'run.cancelled' END;
    IF NOT EXISTS (SELECT 1 FROM "conversation_run_events" WHERE "run_id" = NEW."id" AND "type" = expected_type) THEN
        RAISE EXCEPTION 'terminal conversation AgentRun requires its matching terminal RunEvent';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "terminal_agent_runs_require_event" AFTER INSERT OR UPDATE OF "state" ON "agent_runs"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "enforce_terminal_agent_run_event"();
