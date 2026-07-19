-- Personas-owned onboarding authority. Fresh records only; no default or legacy persona is seeded.
CREATE TYPE "PersonaInterviewCategory" AS ENUM ('relationship_role', 'tone_language', 'answer_structure', 'challenge_support', 'initiative', 'approval_risk', 'working_habits', 'memory_boundaries');
CREATE TYPE "PersonaQuestionSetState" AS ENUM ('draft', 'reviewed');
CREATE TYPE "PersonaInterviewState" AS ENUM ('in_progress', 'completed', 'retaken');
CREATE TYPE "PersonaRevisionState" AS ENUM ('draft', 'approved');

CREATE TABLE "persona_question_sets" (
    "question_set_id" TEXT NOT NULL, "version" INTEGER NOT NULL, "state" "PersonaQuestionSetState" NOT NULL DEFAULT 'draft',
    "reviewed_by" TEXT, "reviewed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "persona_question_sets_pkey" PRIMARY KEY ("question_set_id", "version"),
    CONSTRAINT "persona_question_sets_valid_check" CHECK (
        btrim("question_set_id") <> '' AND "version" > 0 AND
        (("state" = 'draft' AND "reviewed_by" IS NULL AND "reviewed_at" IS NULL) OR
         ("state" = 'reviewed' AND "reviewed_by" IS NOT NULL AND btrim("reviewed_by") <> '' AND "reviewed_at" IS NOT NULL))
    )
);
CREATE TABLE "persona_questions" (
    "question_set_id" TEXT NOT NULL, "question_set_version" INTEGER NOT NULL, "question_id" TEXT NOT NULL,
    "category" "PersonaInterviewCategory" NOT NULL, "prompt" TEXT NOT NULL, "ordinal" INTEGER NOT NULL,
    CONSTRAINT "persona_questions_pkey" PRIMARY KEY ("question_set_id", "question_set_version", "question_id"),
    CONSTRAINT "persona_questions_valid_check" CHECK (btrim("question_id") <> '' AND btrim("prompt") <> '' AND "ordinal" > 0)
);
CREATE TABLE "persona_soul_templates" (
    "template_id" TEXT NOT NULL, "version" INTEGER NOT NULL, "digest" TEXT NOT NULL, "content" TEXT NOT NULL,
    "selection_rules" JSONB NOT NULL, "reviewed_by" TEXT NOT NULL, "reviewed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "persona_soul_templates_pkey" PRIMARY KEY ("template_id", "version"),
    CONSTRAINT "persona_soul_templates_valid_check" CHECK (
        btrim("template_id") <> '' AND "version" > 0 AND "digest" ~ '^sha256:[0-9a-f]{64}$'
        AND btrim("content") <> '' AND jsonb_typeof("selection_rules") = 'array' AND btrim("reviewed_by") <> ''
    )
);
CREATE TABLE "persona_profiles" (
    "id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "active_revision_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "persona_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "persona_profiles_identity_check" CHECK (btrim("silo_id") <> '' AND btrim("user_id") <> '')
);
CREATE TABLE "persona_interviews" (
    "id" TEXT NOT NULL, "persona_profile_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
    "question_set_id" TEXT NOT NULL, "question_set_version" INTEGER NOT NULL,
    "state" "PersonaInterviewState" NOT NULL DEFAULT 'in_progress', "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3), CONSTRAINT "persona_interviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "persona_interviews_completion_check" CHECK (
        ("state" = 'in_progress' AND "completed_at" IS NULL) OR ("state" IN ('completed', 'retaken') AND "completed_at" IS NOT NULL)
    )
);
CREATE TABLE "persona_interview_answers" (
    "id" TEXT NOT NULL, "interview_id" TEXT NOT NULL, "question_set_id" TEXT NOT NULL,
    "question_set_version" INTEGER NOT NULL, "question_id" TEXT NOT NULL, "value" TEXT NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "persona_interview_answers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "persona_interview_answers_value_check" CHECK (btrim("value") <> '')
);
CREATE TABLE "persona_revisions" (
    "id" TEXT NOT NULL, "persona_profile_id" TEXT NOT NULL, "revision" INTEGER NOT NULL,
    "state" "PersonaRevisionState" NOT NULL DEFAULT 'draft', "soul_template_id" TEXT NOT NULL,
    "soul_template_version" INTEGER NOT NULL, "soul_template_digest" TEXT NOT NULL, "interview_id" TEXT NOT NULL,
    "selection_rule_id" TEXT NOT NULL, "selection_answer_ids" TEXT[] NOT NULL,
    "compiled_instructions" TEXT NOT NULL, "previous_revision_id" TEXT, "authored_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "approved_by" TEXT, "approved_at" TIMESTAMP(3),
    "durable_soul_mutation_policy" TEXT NOT NULL DEFAULT 'forbidden', CONSTRAINT "persona_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "persona_revisions_valid_check" CHECK (
        "revision" > 0 AND "soul_template_digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("selection_rule_id") <> ''
        AND cardinality("selection_answer_ids") > 0 AND btrim("compiled_instructions") <> ''
        AND btrim("authored_by") <> '' AND "durable_soul_mutation_policy" = 'forbidden'
    ),
    CONSTRAINT "persona_revisions_approval_check" CHECK (
        ("state" = 'draft' AND "approved_by" IS NULL AND "approved_at" IS NULL) OR
        ("state" = 'approved' AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
    ),
    CONSTRAINT "persona_revisions_history_check" CHECK ("previous_revision_id" IS NULL OR "previous_revision_id" <> "id")
);
CREATE TABLE "persona_insights" (
    "id" TEXT NOT NULL, "persona_revision_id" TEXT NOT NULL, "category" "PersonaInterviewCategory" NOT NULL,
    "statement" TEXT NOT NULL, "interview_id" TEXT NOT NULL, "question_set_id" TEXT NOT NULL,
    "question_set_version" INTEGER NOT NULL, "question_id" TEXT NOT NULL, "answer_id" TEXT NOT NULL,
    CONSTRAINT "persona_insights_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "persona_insights_statement_check" CHECK (btrim("statement") <> '')
);

CREATE UNIQUE INDEX "persona_questions_question_set_id_question_set_version_ordinal_key" ON "persona_questions"("question_set_id", "question_set_version", "ordinal");
CREATE INDEX "persona_questions_question_set_id_question_set_version_category_idx" ON "persona_questions"("question_set_id", "question_set_version", "category");
CREATE UNIQUE INDEX "persona_soul_templates_template_id_digest_key" ON "persona_soul_templates"("template_id", "digest");
CREATE UNIQUE INDEX "persona_profiles_silo_id_user_id_key" ON "persona_profiles"("silo_id", "user_id");
CREATE UNIQUE INDEX "persona_profiles_id_user_id_key" ON "persona_profiles"("id", "user_id");
CREATE UNIQUE INDEX "persona_profiles_id_active_revision_id_key" ON "persona_profiles"("id", "active_revision_id");
CREATE UNIQUE INDEX "persona_interviews_exact_identity_key" ON "persona_interviews"("id", "persona_profile_id", "user_id", "question_set_id", "question_set_version");
CREATE INDEX "persona_interviews_persona_profile_id_state_idx" ON "persona_interviews"("persona_profile_id", "state");
CREATE UNIQUE INDEX "persona_interview_answers_interview_id_question_id_key" ON "persona_interview_answers"("interview_id", "question_id");
CREATE UNIQUE INDEX "persona_interview_answers_exact_provenance_key" ON "persona_interview_answers"("id", "interview_id", "question_set_id", "question_set_version", "question_id");
CREATE INDEX "persona_interview_answers_question_idx" ON "persona_interview_answers"("question_set_id", "question_set_version", "question_id");
CREATE UNIQUE INDEX "persona_revisions_persona_profile_id_revision_key" ON "persona_revisions"("persona_profile_id", "revision");
CREATE UNIQUE INDEX "persona_revisions_persona_profile_id_id_key" ON "persona_revisions"("persona_profile_id", "id");
CREATE INDEX "persona_revisions_interview_id_idx" ON "persona_revisions"("interview_id");
CREATE UNIQUE INDEX "persona_insights_persona_revision_id_id_key" ON "persona_insights"("persona_revision_id", "id");
CREATE UNIQUE INDEX "persona_insights_persona_revision_id_answer_id_key" ON "persona_insights"("persona_revision_id", "answer_id");
CREATE INDEX "persona_insights_provenance_idx" ON "persona_insights"("answer_id", "interview_id", "question_set_id", "question_set_version", "question_id");

ALTER TABLE "persona_questions" ADD CONSTRAINT "persona_questions_question_set_fkey" FOREIGN KEY ("question_set_id", "question_set_version") REFERENCES "persona_question_sets"("question_set_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_interviews" ADD CONSTRAINT "persona_interviews_profile_fkey" FOREIGN KEY ("persona_profile_id", "user_id") REFERENCES "persona_profiles"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_interviews" ADD CONSTRAINT "persona_interviews_question_set_fkey" FOREIGN KEY ("question_set_id", "question_set_version") REFERENCES "persona_question_sets"("question_set_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_interview_answers" ADD CONSTRAINT "persona_interview_answers_interview_fkey" FOREIGN KEY ("interview_id") REFERENCES "persona_interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_interview_answers" ADD CONSTRAINT "persona_interview_answers_question_fkey" FOREIGN KEY ("question_set_id", "question_set_version", "question_id") REFERENCES "persona_questions"("question_set_id", "question_set_version", "question_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_revisions" ADD CONSTRAINT "persona_revisions_profile_fkey" FOREIGN KEY ("persona_profile_id") REFERENCES "persona_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_revisions" ADD CONSTRAINT "persona_revisions_interview_fkey" FOREIGN KEY ("interview_id") REFERENCES "persona_interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_revisions" ADD CONSTRAINT "persona_revisions_template_fkey" FOREIGN KEY ("soul_template_id", "soul_template_version") REFERENCES "persona_soul_templates"("template_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_revisions" ADD CONSTRAINT "persona_revisions_previous_fkey" FOREIGN KEY ("previous_revision_id") REFERENCES "persona_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_insights" ADD CONSTRAINT "persona_insights_revision_fkey" FOREIGN KEY ("persona_revision_id") REFERENCES "persona_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_insights" ADD CONSTRAINT "persona_insights_answer_provenance_fkey" FOREIGN KEY ("answer_id", "interview_id", "question_set_id", "question_set_version", "question_id") REFERENCES "persona_interview_answers"("id", "interview_id", "question_set_id", "question_set_version", "question_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_profiles" ADD CONSTRAINT "persona_profiles_active_revision_fkey" FOREIGN KEY ("id", "active_revision_id") REFERENCES "persona_revisions"("persona_profile_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_revisions" ADD CONSTRAINT "agent_revisions_persona_revision_id_fkey" FOREIGN KEY ("persona_revision_id") REFERENCES "persona_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_persona_question_set_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE missing_count INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PersonaQuestionSet rows cannot be deleted'; END IF;
    IF TG_OP = 'INSERT' AND NEW."state" <> 'draft' THEN RAISE EXCEPTION 'PersonaQuestionSet must begin as Draft'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD."state" = 'reviewed' THEN RAISE EXCEPTION 'reviewed PersonaQuestionSet is immutable'; END IF;
        IF NEW."question_set_id" IS DISTINCT FROM OLD."question_set_id" OR NEW."version" IS DISTINCT FROM OLD."version"
            OR NEW."created_at" IS DISTINCT FROM OLD."created_at" OR NEW."state" <> 'reviewed' THEN
            RAISE EXCEPTION 'PersonaQuestionSet may only transition from Draft to Reviewed';
        END IF;
    END IF;
    IF NEW."state" = 'reviewed' THEN
        SELECT count(*) INTO missing_count FROM unnest(enum_range(NULL::"PersonaInterviewCategory")) category
          WHERE NOT EXISTS (SELECT 1 FROM "persona_questions" q WHERE q."question_set_id" = NEW."question_set_id" AND q."question_set_version" = NEW."version" AND q."category" = category);
        IF missing_count > 0 THEN RAISE EXCEPTION 'reviewed persona question set must cover every required category'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_question_sets_closed_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "persona_question_sets"
    FOR EACH ROW EXECUTE FUNCTION "enforce_persona_question_set_lifecycle"();

CREATE FUNCTION "enforce_persona_question_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE question_set_state "PersonaQuestionSetState";
BEGIN
    IF TG_OP <> 'INSERT' THEN
        SELECT "state" INTO question_set_state FROM "persona_question_sets"
          WHERE "question_set_id" = OLD."question_set_id" AND "version" = OLD."question_set_version" FOR UPDATE;
        IF question_set_state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'questions may change only while PersonaQuestionSet is Draft'; END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT "state" INTO question_set_state FROM "persona_question_sets"
          WHERE "question_set_id" = NEW."question_set_id" AND "version" = NEW."question_set_version" FOR UPDATE;
        IF question_set_state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'questions may change only while PersonaQuestionSet is Draft'; END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_questions_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "persona_questions"
    FOR EACH ROW EXECUTE FUNCTION "enforce_persona_question_mutation"();

CREATE FUNCTION "enforce_persona_interview_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_answers INTEGER; actual_answers INTEGER; question_set_state "PersonaQuestionSetState";
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PersonaInterview rows cannot be deleted'; END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT "state" INTO question_set_state FROM "persona_question_sets"
          WHERE "question_set_id" = NEW."question_set_id" AND "version" = NEW."question_set_version" FOR UPDATE;
        IF question_set_state IS DISTINCT FROM 'reviewed' THEN RAISE EXCEPTION 'PersonaInterview requires a Reviewed question set'; END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."state" IN ('completed', 'retaken') THEN RAISE EXCEPTION 'completed PersonaInterview evidence is immutable'; END IF;
    IF NEW."state" = 'completed' THEN
        SELECT count(*) INTO expected_answers FROM "persona_questions" WHERE "question_set_id" = NEW."question_set_id" AND "question_set_version" = NEW."question_set_version";
        SELECT count(*) INTO actual_answers FROM "persona_interview_answers" WHERE "interview_id" = NEW."id";
        IF expected_answers = 0 OR actual_answers <> expected_answers THEN RAISE EXCEPTION 'completed PersonaInterview must answer every reviewed question exactly once'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_interviews_closed_lifecycle" BEFORE UPDATE OR DELETE ON "persona_interviews" FOR EACH ROW EXECUTE FUNCTION "enforce_persona_interview_lifecycle"();

CREATE FUNCTION "enforce_persona_answer_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE interview_question_set TEXT; interview_question_version INTEGER; interview_state "PersonaInterviewState";
BEGIN
    SELECT "question_set_id", "question_set_version", "state" INTO interview_question_set, interview_question_version, interview_state
      FROM "persona_interviews" WHERE "id" = NEW."interview_id" FOR UPDATE;
    IF interview_state IS DISTINCT FROM 'in_progress' THEN RAISE EXCEPTION 'answers may be added only while PersonaInterview is InProgress'; END IF;
    IF interview_question_set IS DISTINCT FROM NEW."question_set_id" OR interview_question_version IS DISTINCT FROM NEW."question_set_version" THEN
        RAISE EXCEPTION 'PersonaInterviewAnswer must use the exact interview question-set revision';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_interview_answers_exact_question_set" BEFORE INSERT ON "persona_interview_answers" FOR EACH ROW EXECUTE FUNCTION "enforce_persona_answer_provenance"();

CREATE FUNCTION "enforce_persona_insight_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_interview TEXT; revision_state "PersonaRevisionState"; question_category "PersonaInterviewCategory";
BEGIN
    SELECT "interview_id", "state" INTO revision_interview, revision_state FROM "persona_revisions" WHERE "id" = NEW."persona_revision_id" FOR UPDATE;
    IF revision_state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'insights may be added only while PersonaRevision is Draft'; END IF;
    SELECT "category" INTO question_category FROM "persona_questions"
      WHERE "question_set_id" = NEW."question_set_id" AND "question_set_version" = NEW."question_set_version" AND "question_id" = NEW."question_id";
    IF revision_interview IS DISTINCT FROM NEW."interview_id" OR question_category IS DISTINCT FROM NEW."category" THEN
        RAISE EXCEPTION 'PersonaInsight must match its revision interview and exact question category';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_insights_exact_provenance" BEFORE INSERT ON "persona_insights" FOR EACH ROW EXECUTE FUNCTION "enforce_persona_insight_provenance"();

CREATE FUNCTION "enforce_persona_revision_lifecycle"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    insight_count INTEGER;
    interview_state "PersonaInterviewState";
    interview_profile TEXT;
    template_digest TEXT;
    previous_profile TEXT;
    selected_template_id TEXT;
    selected_template_version INTEGER;
    selected_template_digest TEXT;
    selected_rule_id TEXT;
    expected_answer_ids TEXT[];
BEGIN
    IF TG_OP = 'INSERT' AND NEW."state" <> 'draft' THEN RAISE EXCEPTION 'PersonaRevision must begin as Draft'; END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PersonaRevision rows cannot be deleted'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD."state" = 'approved' THEN RAISE EXCEPTION 'approved PersonaRevision is immutable'; END IF;
        IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."persona_profile_id" IS DISTINCT FROM OLD."persona_profile_id"
            OR NEW."revision" IS DISTINCT FROM OLD."revision" OR NEW."soul_template_id" IS DISTINCT FROM OLD."soul_template_id"
            OR NEW."soul_template_version" IS DISTINCT FROM OLD."soul_template_version" OR NEW."soul_template_digest" IS DISTINCT FROM OLD."soul_template_digest"
            OR NEW."interview_id" IS DISTINCT FROM OLD."interview_id" OR NEW."selection_rule_id" IS DISTINCT FROM OLD."selection_rule_id"
            OR NEW."selection_answer_ids" IS DISTINCT FROM OLD."selection_answer_ids" OR NEW."compiled_instructions" IS DISTINCT FROM OLD."compiled_instructions"
            OR NEW."previous_revision_id" IS DISTINCT FROM OLD."previous_revision_id" OR NEW."authored_by" IS DISTINCT FROM OLD."authored_by"
            OR NEW."created_at" IS DISTINCT FROM OLD."created_at" OR NEW."durable_soul_mutation_policy" IS DISTINCT FROM OLD."durable_soul_mutation_policy" THEN
            RAISE EXCEPTION 'PersonaRevision content is immutable; edits create a new revision';
        END IF;
    END IF;
    IF NEW."previous_revision_id" IS NOT NULL THEN
        SELECT "persona_profile_id" INTO previous_profile FROM "persona_revisions" WHERE "id" = NEW."previous_revision_id" FOR UPDATE;
        IF previous_profile IS DISTINCT FROM NEW."persona_profile_id" THEN RAISE EXCEPTION 'PersonaRevision history must stay inside one profile'; END IF;
    END IF;
    IF NEW."state" = 'approved' THEN
        SELECT "state", "persona_profile_id" INTO interview_state, interview_profile FROM "persona_interviews" WHERE "id" = NEW."interview_id" FOR UPDATE;
        SELECT "digest" INTO template_digest FROM "persona_soul_templates" WHERE "template_id" = NEW."soul_template_id" AND "version" = NEW."soul_template_version";
        SELECT count(*) INTO insight_count FROM "persona_insights" WHERE "persona_revision_id" = NEW."id";
        IF interview_state IS DISTINCT FROM 'completed' OR interview_profile IS DISTINCT FROM NEW."persona_profile_id" OR template_digest IS DISTINCT FROM NEW."soul_template_digest" OR insight_count < 3 OR insight_count > 5 THEN
            RAISE EXCEPTION 'PersonaRevision approval requires completed matching interview, exact template digest, and three to five insights';
        END IF;
        SELECT candidate."template_id", candidate."version", candidate."digest", candidate."rule_id", candidate."answer_ids"
          INTO selected_template_id, selected_template_version, selected_template_digest, selected_rule_id, expected_answer_ids
          FROM (
            SELECT template."template_id", template."version", template."digest", rule ->> 'id' AS "rule_id",
                ARRAY(
                    SELECT answer."id" FROM jsonb_object_keys(rule -> 'answers') required_question_id
                    JOIN "persona_interview_answers" answer ON answer."interview_id" = NEW."interview_id"
                        AND answer."question_id" = required_question_id
                    ORDER BY answer."id"
                ) AS "answer_ids",
                (rule ->> 'priority')::INTEGER AS "priority"
            FROM "persona_soul_templates" template
            CROSS JOIN LATERAL jsonb_array_elements(template."selection_rules") rule
            WHERE NOT EXISTS (
                SELECT 1 FROM jsonb_each_text(rule -> 'answers') required_answer
                WHERE NOT EXISTS (
                    SELECT 1 FROM "persona_interview_answers" answer
                    WHERE answer."interview_id" = NEW."interview_id"
                      AND answer."question_id" = required_answer.key AND answer."value" = required_answer.value
                )
            )
            ORDER BY "priority" DESC, template."template_id", template."version" DESC, "rule_id"
            LIMIT 1
          ) candidate;
        IF selected_template_id IS DISTINCT FROM NEW."soul_template_id"
            OR selected_template_version IS DISTINCT FROM NEW."soul_template_version"
            OR selected_template_digest IS DISTINCT FROM NEW."soul_template_digest"
            OR selected_rule_id IS DISTINCT FROM NEW."selection_rule_id"
            OR expected_answer_ids IS DISTINCT FROM ARRAY(SELECT answer_id FROM unnest(NEW."selection_answer_ids") answer_id ORDER BY answer_id) THEN
            RAISE EXCEPTION 'PersonaRevision must pin the deterministic answer-selected SOUL template and exact answer evidence';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_revisions_closed_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "persona_revisions" FOR EACH ROW EXECUTE FUNCTION "enforce_persona_revision_lifecycle"();

CREATE FUNCTION "enforce_persona_soul_template_rules"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule_count INTEGER; rule_id_count INTEGER;
BEGIN
    IF jsonb_array_length(NEW."selection_rules") = 0 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW."selection_rules") rule
        WHERE jsonb_typeof(rule) <> 'object' OR btrim(COALESCE(rule ->> 'id', '')) = ''
          OR COALESCE(rule ->> 'priority', '') !~ '^-?[0-9]+$'
          OR CASE WHEN jsonb_typeof(rule -> 'answers') = 'object'
              THEN NOT EXISTS (SELECT 1 FROM jsonb_object_keys(rule -> 'answers')) ELSE true END
    ) THEN RAISE EXCEPTION 'SOUL template selection rules require id, integer priority, and exact answer matches'; END IF;
    SELECT count(*), count(DISTINCT rule ->> 'id') INTO rule_count, rule_id_count FROM jsonb_array_elements(NEW."selection_rules") rule;
    IF rule_count <> rule_id_count THEN RAISE EXCEPTION 'SOUL template selection rule identifiers must be unique'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_soul_templates_valid_rules" BEFORE INSERT ON "persona_soul_templates"
    FOR EACH ROW EXECUTE FUNCTION "enforce_persona_soul_template_rules"();

CREATE FUNCTION "reject_persona_source_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'reviewed persona source is immutable'; END; $$;
CREATE TRIGGER "persona_soul_templates_immutable" BEFORE UPDATE OR DELETE ON "persona_soul_templates" FOR EACH ROW EXECUTE FUNCTION "reject_persona_source_mutation"();
CREATE TRIGGER "persona_interview_answers_immutable" BEFORE UPDATE OR DELETE ON "persona_interview_answers" FOR EACH ROW EXECUTE FUNCTION "reject_persona_source_mutation"();
CREATE TRIGGER "persona_insights_immutable" BEFORE UPDATE OR DELETE ON "persona_insights" FOR EACH ROW EXECUTE FUNCTION "reject_persona_source_mutation"();

CREATE FUNCTION "enforce_personal_agent_persona"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE service_kind "AgentServiceKind"; service_silo_id TEXT; persona_state "PersonaRevisionState"; persona_silo_id TEXT;
BEGIN
    IF NEW."state" = 'published' THEN
        SELECT "kind", "silo_id" INTO service_kind, service_silo_id FROM "agent_services" WHERE "id" = NEW."agent_service_id" FOR UPDATE;
        IF service_kind = 'personal' THEN
            SELECT revision."state", profile."silo_id" INTO persona_state, persona_silo_id
              FROM "persona_revisions" revision JOIN "persona_profiles" profile ON profile."id" = revision."persona_profile_id"
              WHERE revision."id" = NEW."persona_revision_id";
            IF NEW."persona_revision_id" IS NULL OR persona_state IS DISTINCT FROM 'approved' OR persona_silo_id IS DISTINCT FROM service_silo_id THEN
                RAISE EXCEPTION 'personal AgentRevision requires an approved PersonaRevision in the same silo';
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "personal_agent_revisions_require_approved_persona" AFTER INSERT OR UPDATE ON "agent_revisions"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "enforce_personal_agent_persona"();

CREATE FUNCTION "enforce_active_persona_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_state "PersonaRevisionState";
BEGIN
    IF NEW."active_revision_id" IS NULL THEN RETURN NEW; END IF;
    SELECT "state" INTO revision_state FROM "persona_revisions"
      WHERE "id" = NEW."active_revision_id" AND "persona_profile_id" = NEW."id" FOR UPDATE;
    IF revision_state IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'active PersonaRevision must be Approved'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "persona_profiles_active_revision_approved" BEFORE INSERT OR UPDATE OF "active_revision_id" ON "persona_profiles"
    FOR EACH ROW EXECUTE FUNCTION "enforce_active_persona_revision"();
