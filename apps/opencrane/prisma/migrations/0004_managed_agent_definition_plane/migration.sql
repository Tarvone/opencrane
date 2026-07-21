-- Driving domain: agent-services (libs/backend/server/agents/agent-services/main), Phase E slice 5.
-- Corrects the managed-agent definition plane to the #129/#331 target model:
--   * Retires the single-owner shape on AgentService (owner_scope/owner_subject_id + the
--     AgentServiceOwnerScope enum). Ownership now flows through revision-scoped scope attachments.
--   * Adds immutable revision lineage on AgentRevision: parent_revision_id (edit predecessor),
--     source_revision_id (set only on restore), and change_message.
--   * Adds agent_revision_scope_attachments, reusing the canonical GrantScope/GrantSubjectType
--     vocabulary. Each row authorises scoped knowledge read/recall + inject/write for that exact
--     scope only; skills/MCP/model/credential grants stay on their existing assignment tables.
-- No dual-write: the old owner columns/enum are dropped in the same migration that introduces the
-- attachment shape.

-- DropCheck: these raw CHECK constraints reference the owner columns being dropped and are not
-- tracked by the Prisma datamodel, so they must be dropped explicitly first.
ALTER TABLE "agent_services" DROP CONSTRAINT "agent_services_personal_owner_check";
ALTER TABLE "agent_services" DROP CONSTRAINT "agent_services_nonempty_check";

-- DropIndex
DROP INDEX "agent_services_silo_id_owner_scope_owner_subject_id_idx";

-- AlterTable
ALTER TABLE "agent_services" DROP COLUMN "owner_scope",
DROP COLUMN "owner_subject_id";

-- AlterTable
ALTER TABLE "agent_revisions" ADD COLUMN     "change_message" TEXT NOT NULL,
ADD COLUMN     "parent_revision_id" TEXT,
ADD COLUMN     "source_revision_id" TEXT;

-- DropEnum
DROP TYPE "AgentServiceOwnerScope";

-- CreateTable
CREATE TABLE "agent_revision_scope_attachments" (
    "agent_revision_id" TEXT NOT NULL,
    "scope" "GrantScope" NOT NULL,
    "subject_type" "GrantSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,

    CONSTRAINT "agent_revision_scope_attachments_pkey" PRIMARY KEY ("agent_revision_id","scope","subject_type","subject_id")
);

-- CreateIndex
CREATE INDEX "agent_revision_scope_attachments_scope_subject_type_subject_idx" ON "agent_revision_scope_attachments"("scope", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "agent_revisions_parent_revision_id_idx" ON "agent_revisions"("parent_revision_id");

-- CreateIndex
CREATE INDEX "agent_revisions_source_revision_id_idx" ON "agent_revisions"("source_revision_id");

-- AddForeignKey
ALTER TABLE "agent_revisions" ADD CONSTRAINT "agent_revisions_parent_revision_id_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "agent_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_revisions" ADD CONSTRAINT "agent_revisions_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "agent_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_revision_scope_attachments" ADD CONSTRAINT "agent_revision_scope_attachments_agent_revision_id_fkey" FOREIGN KEY ("agent_revision_id") REFERENCES "agent_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheck: restore the AgentService non-empty guard without the retired owner_subject_id clause,
-- and require a non-empty attachment subject, matching the repository's raw-constraint convention.
ALTER TABLE "agent_services" ADD CONSTRAINT "agent_services_nonempty_check" CHECK (
        btrim("silo_id") <> '' AND btrim("name") <> '' AND btrim("workload_profile") <> ''
    );
ALTER TABLE "agent_revision_scope_attachments" ADD CONSTRAINT "agent_revision_scope_attachments_nonempty_check" CHECK (
        btrim("agent_revision_id") <> '' AND btrim("subject_id") <> ''
    );
