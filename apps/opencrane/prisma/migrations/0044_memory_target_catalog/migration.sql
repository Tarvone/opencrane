-- Memory-owned catalog and provenance. Durable fact content stays in Cognee, not Postgres or agent workspaces.
CREATE TYPE "MemoryDatasetState" AS ENUM ('active', 'retired');
CREATE TYPE "MemoryFactState" AS ENUM ('active', 'corrected', 'forget_pending', 'forgotten');
CREATE TYPE "MemoryConsentState" AS ENUM ('explicit', 'confirmed');
CREATE TYPE "MemoryOutboxEventKind" AS ENUM ('memory.fact_recorded', 'memory.fact_corrected', 'memory.forget_requested');

CREATE TABLE "memory_datasets" (
    "id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "scope_kind" "AuthorizationScopeKind" NOT NULL,
    "organization_id" TEXT NOT NULL, "scope_resource_id" TEXT, "cognee_dataset_id" TEXT NOT NULL,
    "state" "MemoryDatasetState" NOT NULL DEFAULT 'active', "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "retired_at" TIMESTAMP(3),
    CONSTRAINT "memory_datasets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memory_datasets_identity_check" CHECK (btrim("silo_id") <> '' AND btrim("organization_id") <> '' AND btrim("cognee_dataset_id") <> '' AND btrim("created_by") <> ''),
    CONSTRAINT "memory_datasets_scope_check" CHECK (
        ("scope_kind" = 'organization' AND "scope_resource_id" IS NULL) OR
        ("scope_kind" <> 'organization' AND "scope_resource_id" IS NOT NULL AND btrim("scope_resource_id") <> '')
    ),
    CONSTRAINT "memory_datasets_retirement_check" CHECK (("state" = 'retired' AND "retired_at" IS NOT NULL) OR ("state" = 'active' AND "retired_at" IS NULL))
);
CREATE TABLE "memory_fact_catalog" (
    "id" TEXT NOT NULL, "dataset_id" TEXT NOT NULL, "cognee_external_id" TEXT NOT NULL, "content_digest" TEXT NOT NULL,
    "state" "MemoryFactState" NOT NULL DEFAULT 'active', "consent_state" "MemoryConsentState" NOT NULL,
    "sensitivity" TEXT NOT NULL, "provenance" JSONB NOT NULL, "source_artifact_revision_id" TEXT,
    "source_message_id" TEXT, "supersedes_fact_id" TEXT, "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "corrected_at" TIMESTAMP(3),
    "forget_requested_at" TIMESTAMP(3), "forgotten_at" TIMESTAMP(3),
    CONSTRAINT "memory_fact_catalog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memory_fact_catalog_valid_check" CHECK (
        btrim("cognee_external_id") <> '' AND "content_digest" ~ '^sha256:[0-9a-f]{64}$'
        AND btrim("sensitivity") <> '' AND jsonb_typeof("provenance") = 'object' AND btrim("recorded_by") <> ''
        AND ((CASE WHEN "source_artifact_revision_id" IS NOT NULL THEN 1 ELSE 0 END)
            + (CASE WHEN "source_message_id" IS NOT NULL THEN 1 ELSE 0 END)
            + (CASE WHEN "provenance" @> '{"user_statement":true}'::jsonb THEN 1 ELSE 0 END)) = 1
    ),
    CONSTRAINT "memory_fact_catalog_history_check" CHECK ("supersedes_fact_id" IS NULL OR "supersedes_fact_id" <> "id"),
    CONSTRAINT "memory_fact_catalog_forget_check" CHECK (
        ("state" = 'active' AND "corrected_at" IS NULL AND "forget_requested_at" IS NULL AND "forgotten_at" IS NULL) OR
        ("state" = 'corrected' AND "corrected_at" IS NOT NULL AND "forget_requested_at" IS NULL AND "forgotten_at" IS NULL) OR
        ("state" = 'forget_pending' AND "forget_requested_at" IS NOT NULL AND "forgotten_at" IS NULL) OR
        ("state" = 'forgotten' AND "forget_requested_at" IS NOT NULL AND "forgotten_at" IS NOT NULL)
    )
);
CREATE TABLE "memory_outbox_events" (
    "id" TEXT NOT NULL, "dataset_id" TEXT NOT NULL, "fact_id" TEXT NOT NULL, "kind" "MemoryOutboxEventKind" NOT NULL,
    "idempotency_key" TEXT NOT NULL, "payload" JSONB NOT NULL, "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3), "published_at" TIMESTAMP(3), "delivery_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "memory_outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memory_outbox_events_valid_check" CHECK (btrim("idempotency_key") <> '' AND jsonb_typeof("payload") = 'object' AND "delivery_count" >= 0)
);

CREATE UNIQUE INDEX "memory_datasets_silo_id_cognee_dataset_id_key" ON "memory_datasets"("silo_id", "cognee_dataset_id");
CREATE UNIQUE INDEX "memory_datasets_exact_scope_key" ON "memory_datasets"("silo_id", "scope_kind", "organization_id", COALESCE("scope_resource_id", ''));
CREATE INDEX "memory_datasets_silo_id_state_idx" ON "memory_datasets"("silo_id", "state");
CREATE UNIQUE INDEX "memory_fact_catalog_dataset_id_cognee_external_id_key" ON "memory_fact_catalog"("dataset_id", "cognee_external_id");
CREATE UNIQUE INDEX "memory_fact_catalog_single_successor_key" ON "memory_fact_catalog"("supersedes_fact_id") WHERE "supersedes_fact_id" IS NOT NULL;
CREATE UNIQUE INDEX "memory_fact_catalog_id_dataset_id_key" ON "memory_fact_catalog"("id", "dataset_id");
CREATE INDEX "memory_fact_catalog_source_artifact_revision_id_idx" ON "memory_fact_catalog"("source_artifact_revision_id");
CREATE INDEX "memory_fact_catalog_source_message_id_idx" ON "memory_fact_catalog"("source_message_id");
CREATE INDEX "memory_fact_catalog_dataset_id_state_idx" ON "memory_fact_catalog"("dataset_id", "state");
CREATE UNIQUE INDEX "memory_outbox_events_idempotency_key_key" ON "memory_outbox_events"("idempotency_key");
CREATE INDEX "memory_outbox_events_published_at_available_at_idx" ON "memory_outbox_events"("published_at", "available_at");

ALTER TABLE "memory_fact_catalog" ADD CONSTRAINT "memory_fact_catalog_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "memory_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memory_fact_catalog" ADD CONSTRAINT "memory_fact_catalog_source_artifact_revision_id_fkey" FOREIGN KEY ("source_artifact_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memory_fact_catalog" ADD CONSTRAINT "memory_fact_catalog_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "conversation_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memory_fact_catalog" ADD CONSTRAINT "memory_fact_catalog_supersedes_fact_id_fkey" FOREIGN KEY ("supersedes_fact_id") REFERENCES "memory_fact_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memory_outbox_events" ADD CONSTRAINT "memory_outbox_events_fact_fkey" FOREIGN KEY ("fact_id", "dataset_id") REFERENCES "memory_fact_catalog"("id", "dataset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_memory_dataset_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'MemoryDataset catalog rows cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW."silo_id" IS DISTINCT FROM OLD."silo_id" OR NEW."scope_kind" IS DISTINCT FROM OLD."scope_kind" OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."scope_resource_id" IS DISTINCT FROM OLD."scope_resource_id" OR NEW."cognee_dataset_id" IS DISTINCT FROM OLD."cognee_dataset_id" OR NEW."created_by" IS DISTINCT FROM OLD."created_by" OR NEW."created_at" IS DISTINCT FROM OLD."created_at") THEN RAISE EXCEPTION 'MemoryDataset authority is immutable'; END IF;
    IF TG_OP = 'UPDATE' AND OLD."state" = 'retired' THEN RAISE EXCEPTION 'retired MemoryDataset is closed'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "memory_datasets_closed_lifecycle" BEFORE UPDATE OR DELETE ON "memory_datasets" FOR EACH ROW EXECUTE FUNCTION "enforce_memory_dataset_lifecycle"();

CREATE FUNCTION "enforce_memory_fact_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_dataset TEXT; prior_state "MemoryFactState"; dataset_silo_id TEXT; source_silo_id TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."state" <> 'active' THEN RAISE EXCEPTION 'MemoryFact catalog entry must begin Active'; END IF;
        SELECT "silo_id" INTO dataset_silo_id FROM "memory_datasets" WHERE "id" = NEW."dataset_id" AND "state" = 'active' FOR UPDATE;
        IF dataset_silo_id IS NULL THEN RAISE EXCEPTION 'MemoryFact requires an active MemoryDataset'; END IF;
        IF NEW."source_artifact_revision_id" IS NOT NULL THEN
            SELECT artifact."silo_id" INTO source_silo_id FROM "artifact_revisions" revision
              JOIN "artifacts" artifact ON artifact."id" = revision."artifact_id"
              WHERE revision."id" = NEW."source_artifact_revision_id" FOR UPDATE OF revision, artifact;
        ELSIF NEW."source_message_id" IS NOT NULL THEN
            SELECT thread."silo_id" INTO source_silo_id FROM "conversation_messages" message
              JOIN "conversation_threads" thread ON thread."id" = message."thread_id"
              WHERE message."id" = NEW."source_message_id" FOR UPDATE OF message, thread;
        ELSE
            source_silo_id := dataset_silo_id;
        END IF;
        IF source_silo_id IS DISTINCT FROM dataset_silo_id THEN RAISE EXCEPTION 'MemoryFact provenance must stay inside its dataset silo'; END IF;
        IF NEW."supersedes_fact_id" IS NOT NULL THEN
            SELECT "dataset_id", "state" INTO prior_dataset, prior_state FROM "memory_fact_catalog" WHERE "id" = NEW."supersedes_fact_id" FOR UPDATE;
            IF prior_dataset IS DISTINCT FROM NEW."dataset_id" OR prior_state IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'memory correction must supersede an active fact in the same dataset'; END IF;
            UPDATE "memory_fact_catalog" SET "state" = 'corrected', "corrected_at" = clock_timestamp() WHERE "id" = NEW."supersedes_fact_id";
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'MemoryFact catalog rows use explicit forget lifecycle'; END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."dataset_id" IS DISTINCT FROM OLD."dataset_id" OR NEW."cognee_external_id" IS DISTINCT FROM OLD."cognee_external_id" OR NEW."content_digest" IS DISTINCT FROM OLD."content_digest" OR NEW."consent_state" IS DISTINCT FROM OLD."consent_state" OR NEW."sensitivity" IS DISTINCT FROM OLD."sensitivity" OR NEW."provenance" IS DISTINCT FROM OLD."provenance" OR NEW."source_artifact_revision_id" IS DISTINCT FROM OLD."source_artifact_revision_id" OR NEW."source_message_id" IS DISTINCT FROM OLD."source_message_id" OR NEW."supersedes_fact_id" IS DISTINCT FROM OLD."supersedes_fact_id" OR NEW."recorded_by" IS DISTINCT FROM OLD."recorded_by" OR NEW."recorded_at" IS DISTINCT FROM OLD."recorded_at" THEN RAISE EXCEPTION 'MemoryFact content and provenance are immutable'; END IF;
    IF OLD."corrected_at" IS NOT NULL AND NEW."corrected_at" IS DISTINCT FROM OLD."corrected_at" THEN RAISE EXCEPTION 'MemoryFact correction evidence is immutable'; END IF;
    IF NOT ((OLD."state" = 'active' AND NEW."state" IN ('active', 'corrected', 'forget_pending'))
        OR (OLD."state" = 'corrected' AND NEW."state" IN ('corrected', 'forget_pending'))
        OR (OLD."state" = 'forget_pending' AND NEW."state" IN ('forget_pending', 'forgotten'))
        OR (OLD."state" = 'forgotten' AND NEW."state" = 'forgotten')) THEN RAISE EXCEPTION 'invalid MemoryFact forget lifecycle'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "memory_fact_catalog_closed_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "memory_fact_catalog" FOR EACH ROW EXECUTE FUNCTION "enforce_memory_fact_lifecycle"();

CREATE FUNCTION "enforce_corrected_memory_successor"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" = 'corrected' AND NOT EXISTS (
        SELECT 1 FROM "memory_fact_catalog" successor WHERE successor."supersedes_fact_id" = NEW."id"
    ) THEN RAISE EXCEPTION 'Corrected MemoryFact requires exactly one committed successor'; END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "corrected_memory_facts_require_successor" AFTER INSERT OR UPDATE OF "state" ON "memory_fact_catalog"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "enforce_corrected_memory_successor"();
