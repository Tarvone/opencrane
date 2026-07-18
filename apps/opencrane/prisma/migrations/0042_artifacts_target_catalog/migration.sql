-- Artifacts-owned metadata authority. Canonical bytes are referenced by ArtifactStore digest only.
CREATE TYPE "ArtifactKind" AS ENUM ('document', 'generated', 'skill', 'upload');
CREATE TYPE "ArtifactState" AS ENUM ('active', 'deletion_pending', 'deleted');
CREATE TYPE "ArtifactRevisionState" AS ENUM ('published', 'deletion_pending', 'purged');
CREATE TYPE "ArtifactIndexState" AS ENUM ('pending', 'indexed', 'failed', 'removal_pending', 'removed');
CREATE TYPE "ArtifactOutboxEventKind" AS ENUM ('artifact.revision_published', 'artifact.sharing_changed', 'artifact.deletion_requested');

CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "owner_principal_id" TEXT NOT NULL, "kind" "ArtifactKind" NOT NULL,
    "state" "ArtifactState" NOT NULL DEFAULT 'active', "current_revision_id" TEXT,
    "retention_policy" TEXT NOT NULL DEFAULT 'until_authorized_deletion', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, "deleted_at" TIMESTAMP(3), CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artifacts_identity_check" CHECK (btrim("silo_id") <> '' AND btrim("owner_principal_id") <> ''),
    CONSTRAINT "artifacts_retention_check" CHECK ("retention_policy" = 'until_authorized_deletion'),
    CONSTRAINT "artifacts_deletion_check" CHECK (("state" = 'deleted' AND "deleted_at" IS NOT NULL) OR ("state" <> 'deleted' AND "deleted_at" IS NULL))
);
CREATE TABLE "artifact_revisions" (
    "id" TEXT NOT NULL, "artifact_id" TEXT NOT NULL, "revision" INTEGER NOT NULL,
    "state" "ArtifactRevisionState" NOT NULL DEFAULT 'published', "content_address" TEXT NOT NULL,
    "byte_length" BIGINT NOT NULL, "media_type" TEXT NOT NULL, "provenance" JSONB NOT NULL,
    "source_run_id" TEXT, "source_message_id" TEXT, "index_state" "ArtifactIndexState" NOT NULL DEFAULT 'pending',
    "cognee_external_id" TEXT, "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletion_requested_at" TIMESTAMP(3), "purged_at" TIMESTAMP(3), CONSTRAINT "artifact_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artifact_revisions_content_check" CHECK (
        "revision" > 0 AND "content_address" ~ '^sha256:[0-9a-f]{64}$' AND "byte_length" >= 0
        AND btrim("media_type") <> '' AND strpos("media_type", '/') > 1 AND jsonb_typeof("provenance") = 'object' AND btrim("created_by") <> ''
    ),
    CONSTRAINT "artifact_revisions_deletion_check" CHECK (
        ("state" = 'published' AND "deletion_requested_at" IS NULL AND "purged_at" IS NULL) OR
        ("state" = 'deletion_pending' AND "deletion_requested_at" IS NOT NULL AND "purged_at" IS NULL) OR
        ("state" = 'purged' AND "deletion_requested_at" IS NOT NULL AND "purged_at" IS NOT NULL)
    ),
    CONSTRAINT "artifact_revisions_index_check" CHECK (
        ("index_state" = 'indexed' AND "cognee_external_id" IS NOT NULL) OR
        ("index_state" <> 'indexed')
    )
);
CREATE TABLE "artifact_revision_parents" (
    "child_revision_id" TEXT NOT NULL, "parent_revision_id" TEXT NOT NULL,
    CONSTRAINT "artifact_revision_parents_pkey" PRIMARY KEY ("child_revision_id", "parent_revision_id"),
    CONSTRAINT "artifact_revision_parents_no_self_check" CHECK ("child_revision_id" <> "parent_revision_id")
);
CREATE TABLE "artifact_outbox_events" (
    "id" TEXT NOT NULL, "artifact_id" TEXT NOT NULL, "revision_id" TEXT NOT NULL, "kind" "ArtifactOutboxEventKind" NOT NULL,
    "idempotency_key" TEXT NOT NULL, "payload" JSONB NOT NULL, "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3), "published_at" TIMESTAMP(3), "delivery_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "artifact_outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artifact_outbox_events_valid_check" CHECK (btrim("idempotency_key") <> '' AND jsonb_typeof("payload") = 'object' AND "delivery_count" >= 0)
);

CREATE UNIQUE INDEX "artifacts_id_current_revision_id_key" ON "artifacts"("id", "current_revision_id");
CREATE UNIQUE INDEX "artifacts_id_silo_id_key" ON "artifacts"("id", "silo_id");
CREATE INDEX "artifacts_silo_id_owner_principal_id_state_idx" ON "artifacts"("silo_id", "owner_principal_id", "state");
CREATE UNIQUE INDEX "artifact_revisions_artifact_id_revision_key" ON "artifact_revisions"("artifact_id", "revision");
CREATE UNIQUE INDEX "artifact_revisions_artifact_id_id_key" ON "artifact_revisions"("artifact_id", "id");
CREATE UNIQUE INDEX "artifact_revisions_id_content_address_key" ON "artifact_revisions"("id", "content_address");
CREATE INDEX "artifact_revisions_content_address_state_idx" ON "artifact_revisions"("content_address", "state");
CREATE INDEX "artifact_revisions_source_run_id_idx" ON "artifact_revisions"("source_run_id");
CREATE INDEX "artifact_revisions_index_state_created_at_idx" ON "artifact_revisions"("index_state", "created_at");
CREATE INDEX "artifact_revision_parents_parent_revision_id_idx" ON "artifact_revision_parents"("parent_revision_id");
CREATE UNIQUE INDEX "artifact_outbox_events_idempotency_key_key" ON "artifact_outbox_events"("idempotency_key");
CREATE INDEX "artifact_outbox_events_published_at_available_at_idx" ON "artifact_outbox_events"("published_at", "available_at");

ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_id_current_revision_id_fkey" FOREIGN KEY ("id", "current_revision_id") REFERENCES "artifact_revisions"("artifact_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "conversation_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_revision_parents" ADD CONSTRAINT "artifact_revision_parents_child_fkey" FOREIGN KEY ("child_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_revision_parents" ADD CONSTRAINT "artifact_revision_parents_parent_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_outbox_events" ADD CONSTRAINT "artifact_outbox_events_revision_fkey" FOREIGN KEY ("artifact_id", "revision_id") REFERENCES "artifact_revisions"("artifact_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_artifact_revision_silo_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE artifact_silo_id TEXT; source_silo_id TEXT;
BEGIN
    SELECT "silo_id" INTO artifact_silo_id FROM "artifacts" WHERE "id" = NEW."artifact_id" FOR UPDATE;
    IF NEW."source_run_id" IS NOT NULL THEN
        SELECT "silo_id" INTO source_silo_id FROM "agent_runs" WHERE "id" = NEW."source_run_id" FOR UPDATE;
        IF source_silo_id IS DISTINCT FROM artifact_silo_id THEN RAISE EXCEPTION 'ArtifactRevision run provenance must stay inside its silo'; END IF;
    END IF;
    IF NEW."source_message_id" IS NOT NULL THEN
        SELECT thread."silo_id" INTO source_silo_id FROM "conversation_messages" message
          JOIN "conversation_threads" thread ON thread."id" = message."thread_id"
          WHERE message."id" = NEW."source_message_id" FOR UPDATE OF message, thread;
        IF source_silo_id IS DISTINCT FROM artifact_silo_id THEN RAISE EXCEPTION 'ArtifactRevision message provenance must stay inside its silo'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "artifact_revisions_silo_provenance" BEFORE INSERT OR UPDATE OF "artifact_id", "source_run_id", "source_message_id" ON "artifact_revisions"
    FOR EACH ROW EXECUTE FUNCTION "enforce_artifact_revision_silo_provenance"();

CREATE FUNCTION "enforce_artifact_revision_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW."state" <> 'published' THEN RAISE EXCEPTION 'ArtifactRevision becomes visible only through finalization'; END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ArtifactRevision metadata cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."artifact_id" IS DISTINCT FROM OLD."artifact_id" OR NEW."revision" IS DISTINCT FROM OLD."revision"
            OR NEW."content_address" IS DISTINCT FROM OLD."content_address" OR NEW."byte_length" IS DISTINCT FROM OLD."byte_length"
            OR NEW."media_type" IS DISTINCT FROM OLD."media_type" OR NEW."provenance" IS DISTINCT FROM OLD."provenance"
            OR NEW."source_run_id" IS DISTINCT FROM OLD."source_run_id" OR NEW."source_message_id" IS DISTINCT FROM OLD."source_message_id"
            OR NEW."created_by" IS DISTINCT FROM OLD."created_by" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
            RAISE EXCEPTION 'ArtifactRevision content and provenance are immutable';
        END IF;
        IF NOT ((OLD."state" = 'published' AND NEW."state" IN ('published', 'deletion_pending')) OR (OLD."state" = 'deletion_pending' AND NEW."state" IN ('deletion_pending', 'purged')) OR (OLD."state" = 'purged' AND NEW."state" = 'purged')) THEN
            RAISE EXCEPTION 'invalid ArtifactRevision lifecycle transition';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "artifact_revisions_closed_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "artifact_revisions" FOR EACH ROW EXECUTE FUNCTION "enforce_artifact_revision_lifecycle"();

CREATE FUNCTION "enforce_artifact_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_state "ArtifactRevisionState";
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Artifact rows use authorized deletion lifecycle'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW."silo_id" IS DISTINCT FROM OLD."silo_id" OR NEW."owner_principal_id" IS DISTINCT FROM OLD."owner_principal_id" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."retention_policy" IS DISTINCT FROM OLD."retention_policy" OR NEW."created_at" IS DISTINCT FROM OLD."created_at") THEN RAISE EXCEPTION 'Artifact identity and retention are immutable'; END IF;
    IF TG_OP = 'UPDATE' AND NOT ((OLD."state" = 'active' AND NEW."state" IN ('active', 'deletion_pending')) OR (OLD."state" = 'deletion_pending' AND NEW."state" IN ('deletion_pending', 'deleted')) OR (OLD."state" = 'deleted' AND NEW."state" = 'deleted')) THEN RAISE EXCEPTION 'invalid Artifact lifecycle transition'; END IF;
    IF NEW."current_revision_id" IS NOT NULL THEN
        SELECT "state" INTO revision_state FROM "artifact_revisions" WHERE "id" = NEW."current_revision_id" AND "artifact_id" = NEW."id" FOR UPDATE;
        IF revision_state IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'current Artifact revision must be Published'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "artifacts_closed_lifecycle" BEFORE UPDATE OR DELETE ON "artifacts" FOR EACH ROW EXECUTE FUNCTION "enforce_artifact_lifecycle"();

CREATE FUNCTION "protect_current_artifact_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" <> 'published' AND EXISTS (SELECT 1 FROM "artifacts" WHERE "id" = NEW."artifact_id" AND "current_revision_id" = NEW."id") THEN RAISE EXCEPTION 'current ArtifactRevision must remain Published'; END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "current_artifact_revisions_remain_published" AFTER UPDATE OF "state" ON "artifact_revisions" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "protect_current_artifact_revision"();

CREATE FUNCTION "reject_artifact_parent_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ArtifactRevision lineage is immutable'; END; $$;
CREATE TRIGGER "artifact_revision_parents_immutable" BEFORE UPDATE OR DELETE ON "artifact_revision_parents" FOR EACH ROW EXECUTE FUNCTION "reject_artifact_parent_mutation"();

CREATE FUNCTION "enforce_artifact_parent_silo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE child_silo_id TEXT; parent_silo_id TEXT;
BEGIN
    SELECT artifact."silo_id" INTO child_silo_id FROM "artifact_revisions" revision
      JOIN "artifacts" artifact ON artifact."id" = revision."artifact_id" WHERE revision."id" = NEW."child_revision_id" FOR UPDATE OF revision, artifact;
    SELECT artifact."silo_id" INTO parent_silo_id FROM "artifact_revisions" revision
      JOIN "artifacts" artifact ON artifact."id" = revision."artifact_id" WHERE revision."id" = NEW."parent_revision_id" FOR UPDATE OF revision, artifact;
    IF child_silo_id IS DISTINCT FROM parent_silo_id THEN RAISE EXCEPTION 'ArtifactRevision lineage cannot cross silos'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "artifact_revision_parents_same_silo" BEFORE INSERT ON "artifact_revision_parents"
    FOR EACH ROW EXECUTE FUNCTION "enforce_artifact_parent_silo"();
