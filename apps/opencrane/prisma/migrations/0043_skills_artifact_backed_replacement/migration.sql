-- Skills-owned direct replacement. Old filesystem/OCI-era catalog rows are deliberately discarded.
ALTER TABLE "grants" DROP CONSTRAINT IF EXISTS "grants_skill_bundle_id_fkey";
ALTER TABLE "grants" DROP COLUMN IF EXISTS "skill_bundle_id";
DROP TABLE IF EXISTS "skill_entitlements";
DROP TABLE IF EXISTS "skill_promotions";
DROP TABLE IF EXISTS "skill_bundles";
DROP TABLE IF EXISTS "skills";
DROP TYPE IF EXISTS "SkillBundleScanStatus";
DROP TYPE IF EXISTS "skill_promotion_status";
DROP TYPE IF EXISTS "skill_bundle_status";

CREATE TYPE "SkillState" AS ENUM ('active', 'retired');
CREATE TYPE "SkillRevisionState" AS ENUM ('draft', 'review', 'published', 'rejected', 'revoked');
CREATE TYPE "SkillTrustClass" AS ENUM ('reviewed_instructions', 'sandboxed_python');

CREATE TABLE "skills" (
    "id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "owner_principal_id" TEXT NOT NULL, "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '', "state" "SkillState" NOT NULL DEFAULT 'active', "current_revision_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skills_identity_check" CHECK (btrim("silo_id") <> '' AND btrim("owner_principal_id") <> '' AND btrim("name") <> '')
);
CREATE TABLE "skill_revisions" (
    "id" TEXT NOT NULL, "skill_id" TEXT NOT NULL, "revision" INTEGER NOT NULL,
    "state" "SkillRevisionState" NOT NULL DEFAULT 'draft', "artifact_id" TEXT NOT NULL,
    "artifact_revision_id" TEXT NOT NULL, "artifact_content_address" TEXT NOT NULL, "manifest" JSONB NOT NULL,
    "requirements" JSONB NOT NULL, "test_report" JSONB, "scan_result" JSONB, "trust_class" "SkillTrustClass" NOT NULL,
    "signature" TEXT, "signer_key_id" TEXT, "authored_by" TEXT NOT NULL, "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "published_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3),
    CONSTRAINT "skill_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_revisions_content_check" CHECK (
        "revision" > 0 AND "artifact_content_address" ~ '^sha256:[0-9a-f]{64}$'
        AND jsonb_typeof("manifest") = 'object' AND jsonb_typeof("requirements") = 'object' AND btrim("authored_by") <> ''
    ),
    CONSTRAINT "skill_revisions_publication_check" CHECK (
        ("state" IN ('draft', 'review', 'rejected') AND "published_at" IS NULL AND "revoked_at" IS NULL) OR
        ("state" = 'published' AND "published_at" IS NOT NULL AND "revoked_at" IS NULL) OR
        ("state" = 'revoked' AND "published_at" IS NOT NULL AND "revoked_at" IS NOT NULL)
    ),
    CONSTRAINT "skill_revisions_review_check" CHECK (
        "state" NOT IN ('published', 'revoked') OR
        ("reviewed_by" IS NOT NULL AND btrim("reviewed_by") <> ''
         AND "test_report" @> '{"passed":true}'::jsonb AND "scan_result" @> '{"passed":true}'::jsonb
         AND "signature" IS NOT NULL AND btrim("signature") <> '' AND "signer_key_id" IS NOT NULL AND btrim("signer_key_id") <> '')
    )
);

CREATE UNIQUE INDEX "skills_id_current_revision_id_key" ON "skills"("id", "current_revision_id");
CREATE UNIQUE INDEX "skills_silo_id_owner_principal_id_name_key" ON "skills"("silo_id", "owner_principal_id", "name");
CREATE INDEX "skills_silo_id_state_idx" ON "skills"("silo_id", "state");
CREATE UNIQUE INDEX "skill_revisions_skill_id_revision_key" ON "skill_revisions"("skill_id", "revision");
CREATE UNIQUE INDEX "skill_revisions_skill_id_id_key" ON "skill_revisions"("skill_id", "id");
CREATE UNIQUE INDEX "skill_revisions_exact_artifact_key" ON "skill_revisions"("id", "artifact_revision_id", "artifact_content_address");
CREATE INDEX "skill_revisions_artifact_revision_id_idx" ON "skill_revisions"("artifact_revision_id");
CREATE INDEX "skill_revisions_state_trust_class_idx" ON "skill_revisions"("state", "trust_class");

ALTER TABLE "skill_revisions" ADD CONSTRAINT "skill_revisions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skill_revisions" ADD CONSTRAINT "skill_revisions_artifact_fkey" FOREIGN KEY ("artifact_id", "artifact_revision_id") REFERENCES "artifact_revisions"("artifact_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skills" ADD CONSTRAINT "skills_id_current_revision_id_fkey" FOREIGN KEY ("id", "current_revision_id") REFERENCES "skill_revisions"("skill_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_revision_skill_assignments" ADD CONSTRAINT "agent_revision_skill_assignments_skill_revision_fkey" FOREIGN KEY ("skill_id", "skill_revision_id") REFERENCES "skill_revisions"("skill_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_skill_revision_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE artifact_address TEXT; artifact_state "ArtifactRevisionState"; skill_silo_id TEXT; artifact_silo_id TEXT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW."state" <> 'draft' THEN RAISE EXCEPTION 'SkillRevision must begin as Draft'; END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SkillRevision rows cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."skill_id" IS DISTINCT FROM OLD."skill_id" OR NEW."revision" IS DISTINCT FROM OLD."revision"
            OR NEW."artifact_id" IS DISTINCT FROM OLD."artifact_id" OR NEW."artifact_revision_id" IS DISTINCT FROM OLD."artifact_revision_id"
            OR NEW."artifact_content_address" IS DISTINCT FROM OLD."artifact_content_address" OR NEW."manifest" IS DISTINCT FROM OLD."manifest"
            OR NEW."requirements" IS DISTINCT FROM OLD."requirements" OR NEW."trust_class" IS DISTINCT FROM OLD."trust_class"
            OR NEW."authored_by" IS DISTINCT FROM OLD."authored_by" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
            RAISE EXCEPTION 'SkillRevision content is immutable; changes create a new revision';
        END IF;
        IF OLD."state" IN ('published', 'revoked') AND (
            NEW."test_report" IS DISTINCT FROM OLD."test_report" OR NEW."scan_result" IS DISTINCT FROM OLD."scan_result"
            OR NEW."signature" IS DISTINCT FROM OLD."signature" OR NEW."signer_key_id" IS DISTINCT FROM OLD."signer_key_id"
            OR NEW."reviewed_by" IS DISTINCT FROM OLD."reviewed_by" OR NEW."published_at" IS DISTINCT FROM OLD."published_at") THEN
            RAISE EXCEPTION 'published SkillRevision review and signature evidence is immutable';
        END IF;
        IF NOT ((OLD."state" = 'draft' AND NEW."state" IN ('draft', 'review', 'rejected')) OR (OLD."state" = 'review' AND NEW."state" IN ('review', 'published', 'rejected')) OR (OLD."state" = 'published' AND NEW."state" IN ('published', 'revoked')) OR (OLD."state" IN ('rejected', 'revoked') AND NEW."state" = OLD."state")) THEN RAISE EXCEPTION 'invalid SkillRevision lifecycle transition'; END IF;
    END IF;
    SELECT "silo_id" INTO skill_silo_id FROM "skills" WHERE "id" = NEW."skill_id" FOR UPDATE;
    SELECT artifact."silo_id" INTO artifact_silo_id FROM "artifact_revisions" revision
      JOIN "artifacts" artifact ON artifact."id" = revision."artifact_id"
      WHERE revision."id" = NEW."artifact_revision_id" AND revision."artifact_id" = NEW."artifact_id" FOR UPDATE OF revision, artifact;
    IF skill_silo_id IS DISTINCT FROM artifact_silo_id THEN RAISE EXCEPTION 'SkillRevision ArtifactRevision must stay inside the Skill silo'; END IF;
    IF NEW."state" = 'published' THEN
        SELECT "content_address", "state" INTO artifact_address, artifact_state FROM "artifact_revisions" WHERE "id" = NEW."artifact_revision_id" AND "artifact_id" = NEW."artifact_id" FOR UPDATE;
        IF artifact_address IS DISTINCT FROM NEW."artifact_content_address" OR artifact_state IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'SkillRevision must pin an exact published ArtifactRevision'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "skill_revisions_closed_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "skill_revisions" FOR EACH ROW EXECUTE FUNCTION "enforce_skill_revision_lifecycle"();

CREATE FUNCTION "enforce_skill_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Skill rows cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id"
            OR NEW."owner_principal_id" IS DISTINCT FROM OLD."owner_principal_id" OR NEW."name" IS DISTINCT FROM OLD."name"
            OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN RAISE EXCEPTION 'Skill identity is immutable'; END IF;
        IF NOT ((OLD."state" = 'active' AND NEW."state" IN ('active', 'retired')) OR (OLD."state" = 'retired' AND NEW."state" = 'retired')) THEN
            RAISE EXCEPTION 'invalid Skill lifecycle transition';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "skills_closed_lifecycle" BEFORE UPDATE OR DELETE ON "skills" FOR EACH ROW EXECUTE FUNCTION "enforce_skill_lifecycle"();

CREATE FUNCTION "enforce_current_skill_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_state "SkillRevisionState";
BEGIN
    IF NEW."current_revision_id" IS NOT NULL THEN
        SELECT "state" INTO revision_state FROM "skill_revisions" WHERE "id" = NEW."current_revision_id" AND "skill_id" = NEW."id" FOR UPDATE;
        IF revision_state IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'current Skill revision must be Published'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "skills_current_revision_published" BEFORE INSERT OR UPDATE ON "skills" FOR EACH ROW EXECUTE FUNCTION "enforce_current_skill_revision"();

CREATE FUNCTION "protect_assigned_skill_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" <> 'published' AND EXISTS (SELECT 1 FROM "agent_revision_skill_assignments" WHERE "skill_revision_id" = NEW."id") THEN RAISE EXCEPTION 'assigned SkillRevision must remain Published'; END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "assigned_skill_revisions_remain_published" AFTER UPDATE OF "state" ON "skill_revisions" DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "protect_assigned_skill_revision"();

CREATE FUNCTION "protect_skill_artifact_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" <> 'published' AND EXISTS (
        SELECT 1 FROM "skill_revisions" revision
        WHERE revision."artifact_revision_id" = NEW."id" AND revision."artifact_id" = NEW."artifact_id"
          AND (revision."state" = 'published' OR EXISTS (
              SELECT 1 FROM "agent_revision_skill_assignments" assignment WHERE assignment."skill_revision_id" = revision."id"
          ))
    ) THEN RAISE EXCEPTION 'published or assigned SkillRevision keeps its ArtifactRevision Published'; END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "skill_artifact_revisions_remain_published" AFTER UPDATE OF "state" ON "artifact_revisions"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "protect_skill_artifact_revision"();

CREATE FUNCTION "enforce_agent_skill_assignment_silo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE agent_silo_id TEXT; skill_silo_id TEXT; skill_revision_state "SkillRevisionState";
BEGIN
    SELECT service."silo_id" INTO agent_silo_id FROM "agent_revisions" revision
      JOIN "agent_services" service ON service."id" = revision."agent_service_id"
      WHERE revision."id" = NEW."agent_revision_id" FOR UPDATE OF revision, service;
    SELECT skill."silo_id", revision."state" INTO skill_silo_id, skill_revision_state
      FROM "skill_revisions" revision JOIN "skills" skill ON skill."id" = revision."skill_id"
      WHERE revision."id" = NEW."skill_revision_id" AND revision."skill_id" = NEW."skill_id" FOR UPDATE OF revision, skill;
    IF agent_silo_id IS DISTINCT FROM skill_silo_id OR skill_revision_state IS DISTINCT FROM 'published' THEN
        RAISE EXCEPTION 'AgentRevision may assign only a Published SkillRevision from the same silo';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_revision_skill_assignments_same_silo" BEFORE INSERT OR UPDATE ON "agent_revision_skill_assignments"
    FOR EACH ROW EXECUTE FUNCTION "enforce_agent_skill_assignment_silo"();
