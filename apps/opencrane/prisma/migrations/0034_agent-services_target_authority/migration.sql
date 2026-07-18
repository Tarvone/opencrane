-- Agent-services-owned target authority. Schema only: no legacy rows are copied or translated.
CREATE TYPE "AgentServiceKind" AS ENUM ('personal', 'managed');
CREATE TYPE "AgentServiceOwnerScope" AS ENUM ('organization', 'department', 'team', 'project', 'personal', 'user');
CREATE TYPE "AgentServiceState" AS ENUM ('draft', 'active', 'paused', 'retired');
CREATE TYPE "AgentRevisionState" AS ENUM ('draft', 'published', 'rejected', 'retired');

CREATE TABLE "agent_services" (
    "id" TEXT NOT NULL,
    "silo_id" TEXT NOT NULL,
    "kind" "AgentServiceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "owner_scope" "AgentServiceOwnerScope" NOT NULL,
    "owner_subject_id" TEXT NOT NULL,
    "state" "AgentServiceState" NOT NULL DEFAULT 'draft',
    "active_revision_id" TEXT,
    "workload_profile" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_services_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_services_nonempty_check" CHECK (
        btrim("silo_id") <> '' AND btrim("name") <> '' AND
        btrim("owner_subject_id") <> '' AND btrim("workload_profile") <> ''
    ),
    CONSTRAINT "agent_services_personal_owner_check" CHECK (
        "kind" <> 'personal' OR "owner_scope" IN ('personal', 'user')
    ),
    CONSTRAINT "agent_services_active_revision_check" CHECK (
        "state" <> 'active' OR "active_revision_id" IS NOT NULL
    )
);

CREATE TABLE "agent_revisions" (
    "id" TEXT NOT NULL,
    "agent_service_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" "AgentRevisionState" NOT NULL DEFAULT 'draft',
    "digest" TEXT NOT NULL,
    "prompt_policy_version" TEXT NOT NULL,
    "persona_revision_id" TEXT,
    "model_policy_id" TEXT NOT NULL,
    "budget" JSONB NOT NULL,
    "authored_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    CONSTRAINT "agent_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_revisions_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "agent_revisions_nonempty_check" CHECK (
        btrim("agent_service_id") <> '' AND btrim("digest") <> '' AND
        btrim("prompt_policy_version") <> '' AND btrim("model_policy_id") <> '' AND
        btrim("authored_by") <> '' AND "digest" ~ '^sha256:[0-9a-f]{64}$'
    ),
    CONSTRAINT "agent_revisions_publication_check" CHECK (
        ("state" = 'published' AND "published_at" IS NOT NULL) OR
        ("state" = 'retired' AND "published_at" IS NOT NULL) OR
        ("state" IN ('draft', 'rejected') AND "published_at" IS NULL)
    )
);

CREATE TABLE "agent_revision_skill_assignments" (
    "agent_revision_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "skill_revision_id" TEXT NOT NULL,
    CONSTRAINT "agent_revision_skill_assignments_pkey" PRIMARY KEY ("agent_revision_id", "skill_id")
);

CREATE TABLE "agent_revision_mcp_assignments" (
    "agent_revision_id" TEXT NOT NULL,
    "mcp_server_id" TEXT NOT NULL,
    "allowed_tools" TEXT[] NOT NULL,
    CONSTRAINT "agent_revision_mcp_assignments_pkey" PRIMARY KEY ("agent_revision_id", "mcp_server_id")
);

CREATE UNIQUE INDEX "agent_services_id_active_revision_id_key"
    ON "agent_services"("id", "active_revision_id");
CREATE UNIQUE INDEX "agent_services_id_silo_id_key"
    ON "agent_services"("id", "silo_id");
CREATE INDEX "agent_services_silo_id_owner_scope_owner_subject_id_idx"
    ON "agent_services"("silo_id", "owner_scope", "owner_subject_id");
CREATE INDEX "agent_services_silo_id_kind_state_idx"
    ON "agent_services"("silo_id", "kind", "state");
CREATE UNIQUE INDEX "agent_revisions_agent_service_id_revision_key"
    ON "agent_revisions"("agent_service_id", "revision");
CREATE UNIQUE INDEX "agent_revisions_agent_service_id_id_key"
    ON "agent_revisions"("agent_service_id", "id");
CREATE UNIQUE INDEX "agent_revisions_agent_service_id_digest_key"
    ON "agent_revisions"("agent_service_id", "digest");
CREATE INDEX "agent_revisions_digest_idx" ON "agent_revisions"("digest");
CREATE UNIQUE INDEX "agent_revision_skill_assignments_agent_revision_id_skill_revision_id_key"
    ON "agent_revision_skill_assignments"("agent_revision_id", "skill_revision_id");

ALTER TABLE "agent_revisions" ADD CONSTRAINT "agent_revisions_agent_service_id_fkey"
    FOREIGN KEY ("agent_service_id") REFERENCES "agent_services"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_services" ADD CONSTRAINT "agent_services_id_active_revision_id_fkey"
    FOREIGN KEY ("id", "active_revision_id")
    REFERENCES "agent_revisions"("agent_service_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_revision_skill_assignments" ADD CONSTRAINT "agent_revision_skill_assignments_agent_revision_id_fkey"
    FOREIGN KEY ("agent_revision_id") REFERENCES "agent_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_revision_mcp_assignments" ADD CONSTRAINT "agent_revision_mcp_assignments_agent_revision_id_fkey"
    FOREIGN KEY ("agent_revision_id") REFERENCES "agent_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_agent_revision_immutability"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."agent_service_id" IS DISTINCT FROM OLD."agent_service_id"
        OR NEW."revision" IS DISTINCT FROM OLD."revision"
        OR NEW."digest" IS DISTINCT FROM OLD."digest"
        OR NEW."prompt_policy_version" IS DISTINCT FROM OLD."prompt_policy_version"
        OR NEW."persona_revision_id" IS DISTINCT FROM OLD."persona_revision_id"
        OR NEW."model_policy_id" IS DISTINCT FROM OLD."model_policy_id"
        OR NEW."budget" IS DISTINCT FROM OLD."budget"
        OR NEW."authored_by" IS DISTINCT FROM OLD."authored_by"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'AgentRevision executable fields are immutable';
    END IF;
    IF OLD."state" IN ('rejected', 'retired')
        OR (OLD."state" = 'published' AND NEW."state" NOT IN ('published', 'retired'))
        OR (OLD."state" = 'draft' AND NEW."state" NOT IN ('draft', 'published', 'rejected')) THEN
        RAISE EXCEPTION 'invalid AgentRevision lifecycle transition';
    END IF;
    IF NEW."published_at" IS DISTINCT FROM OLD."published_at"
        AND NOT (
            OLD."state" = 'draft' AND NEW."state" = 'published'
            AND OLD."published_at" IS NULL AND NEW."published_at" IS NOT NULL
        ) THEN
        RAISE EXCEPTION 'AgentRevision publication evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_revisions_immutable"
    BEFORE UPDATE ON "agent_revisions"
    FOR EACH ROW EXECUTE FUNCTION "enforce_agent_revision_immutability"();

CREATE FUNCTION "reject_agent_revision_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'AgentRevision rows cannot be deleted';
END;
$$;
CREATE TRIGGER "agent_revisions_no_delete"
    BEFORE DELETE ON "agent_revisions"
    FOR EACH ROW EXECUTE FUNCTION "reject_agent_revision_delete"();

CREATE FUNCTION "enforce_agent_service_lifecycle"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."state" <> 'draft' OR NEW."active_revision_id" IS NOT NULL THEN
            RAISE EXCEPTION 'a new AgentService must begin Draft without an active revision';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'AgentService rows cannot be deleted';
    END IF;
    IF OLD."state" = 'retired' THEN
        RAISE EXCEPTION 'a Retired AgentService is closed and cannot be changed';
    END IF;
    IF NEW."silo_id" IS DISTINCT FROM OLD."silo_id" THEN
        RAISE EXCEPTION 'AgentService silo identity is immutable';
    END IF;
    IF NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
        (OLD."state" = 'draft' AND NEW."state" IN ('active', 'retired')) OR
        (OLD."state" = 'active' AND NEW."state" IN ('paused', 'retired')) OR
        (OLD."state" = 'paused' AND NEW."state" IN ('active', 'retired'))
    ) THEN
        RAISE EXCEPTION 'invalid AgentService lifecycle transition';
    END IF;
    IF NEW."state" = 'retired' AND NEW."active_revision_id" IS NOT NULL THEN
        RAISE EXCEPTION 'a Retired AgentService cannot retain an active revision';
    END IF;
    IF NEW."active_revision_id" IS DISTINCT FROM OLD."active_revision_id"
        AND NEW."state" NOT IN ('active', 'retired') THEN
        RAISE EXCEPTION 'the active revision pointer changes only on activation, rollover, or retirement';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_services_closed_lifecycle"
    BEFORE INSERT OR UPDATE OR DELETE ON "agent_services"
    FOR EACH ROW EXECUTE FUNCTION "enforce_agent_service_lifecycle"();

CREATE FUNCTION "enforce_agent_service_published_active_revision"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    revision_state "AgentRevisionState";
BEGIN
    IF NEW."active_revision_id" IS NOT NULL THEN
        SELECT "state" INTO revision_state
        FROM "agent_revisions"
        WHERE "id" = NEW."active_revision_id"
          AND "agent_service_id" = NEW."id"
        FOR UPDATE;
        IF revision_state IS DISTINCT FROM 'published'::"AgentRevisionState" THEN
            RAISE EXCEPTION 'AgentService active revision must be a Published revision of the same service';
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "agent_services_published_active_revision"
    AFTER INSERT OR UPDATE ON "agent_services"
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION "enforce_agent_service_published_active_revision"();

CREATE FUNCTION "protect_active_agent_revision_publication"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" <> 'published' AND EXISTS (
        SELECT 1
        FROM "agent_services"
        WHERE "id" = NEW."agent_service_id"
          AND "active_revision_id" = NEW."id"
    ) THEN
        RAISE EXCEPTION 'an active AgentService revision must remain Published';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "active_agent_revisions_remain_published"
    AFTER UPDATE OF "state" ON "agent_revisions"
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION "protect_active_agent_revision_publication"();

CREATE FUNCTION "enforce_agent_revision_assignment_immutability"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    revision_state "AgentRevisionState";
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT "state" INTO revision_state
        FROM "agent_revisions"
        WHERE "id" = NEW."agent_revision_id"
        FOR UPDATE;
        IF revision_state IS DISTINCT FROM 'draft'::"AgentRevisionState" THEN
            RAISE EXCEPTION 'assignments may be added only to a draft AgentRevision';
        END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'AgentRevision assignments are immutable';
END;
$$;
CREATE TRIGGER "agent_revision_skill_assignments_immutable"
    BEFORE INSERT OR UPDATE OR DELETE ON "agent_revision_skill_assignments"
    FOR EACH ROW EXECUTE FUNCTION "enforce_agent_revision_assignment_immutability"();
CREATE TRIGGER "agent_revision_mcp_assignments_immutable"
    BEFORE INSERT OR UPDATE OR DELETE ON "agent_revision_mcp_assignments"
    FOR EACH ROW EXECUTE FUNCTION "enforce_agent_revision_assignment_immutability"();
