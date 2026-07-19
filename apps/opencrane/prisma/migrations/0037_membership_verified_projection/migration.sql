-- Membership-owned verified projection. Schema only; no legacy membership is imported.
CREATE TYPE "FleetMembershipScopeKind" AS ENUM ('organization', 'department', 'team', 'project', 'personal', 'direct-user');

CREATE TABLE "verified_fleet_membership_revisions" (
    "id" TEXT NOT NULL, "revision" INTEGER NOT NULL, "issuer_id" TEXT NOT NULL,
    "issuer_key_id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL, "payload_digest" TEXT NOT NULL, "signature" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verified_fleet_membership_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "verified_fleet_membership_revisions_exact_check" CHECK (
        "revision" > 0 AND btrim("issuer_id") <> '' AND btrim("issuer_key_id") <> '' AND
        btrim("silo_id") <> '' AND "payload_digest" ~ '^sha256:[0-9a-f]{64}$' AND btrim("signature") <> ''
    ),
    CONSTRAINT "verified_fleet_membership_revisions_time_check" CHECK (
        "issued_at" < "expires_at" AND "verified_at" >= "issued_at" AND "verified_at" < "expires_at"
    )
);

CREATE TABLE "verified_fleet_membership_assertions" (
    "id" TEXT NOT NULL, "revision_id" TEXT NOT NULL, "assertion_id" TEXT NOT NULL,
    "silo_id" TEXT NOT NULL, "subject_id" TEXT NOT NULL,
    "scope_kind" "FleetMembershipScopeKind" NOT NULL, "organization_id" TEXT NOT NULL,
    "scope_resource_id" TEXT,
    CONSTRAINT "verified_fleet_membership_assertions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "verified_fleet_membership_assertions_exact_check" CHECK (
        btrim("assertion_id") <> '' AND btrim("silo_id") <> '' AND btrim("subject_id") <> '' AND
        btrim("organization_id") <> '' AND
        (("scope_kind" = 'organization' AND "scope_resource_id" IS NULL) OR
         ("scope_kind" <> 'organization' AND "scope_resource_id" IS NOT NULL AND btrim("scope_resource_id") <> ''))
    )
);

CREATE TABLE "highest_accepted_fleet_memberships" (
    "issuer_id" TEXT NOT NULL, "silo_id" TEXT NOT NULL, "revision_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL, "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "highest_accepted_fleet_memberships_pkey" PRIMARY KEY ("issuer_id", "silo_id"),
    CONSTRAINT "highest_accepted_fleet_memberships_revision_check" CHECK ("revision" > 0)
);

CREATE UNIQUE INDEX "verified_fleet_membership_revisions_issuer_id_silo_id_revision_key" ON "verified_fleet_membership_revisions"("issuer_id", "silo_id", "revision");
CREATE UNIQUE INDEX "verified_fleet_membership_revisions_issuer_id_silo_id_payload_digest_key" ON "verified_fleet_membership_revisions"("issuer_id", "silo_id", "payload_digest");
CREATE UNIQUE INDEX "verified_membership_identity_key" ON "verified_fleet_membership_revisions"("id", "issuer_id", "silo_id", "revision");
CREATE UNIQUE INDEX "verified_fleet_membership_revisions_id_silo_id_key" ON "verified_fleet_membership_revisions"("id", "silo_id");
CREATE INDEX "verified_fleet_membership_revisions_silo_id_expires_at_idx" ON "verified_fleet_membership_revisions"("silo_id", "expires_at");
CREATE UNIQUE INDEX "verified_fleet_membership_assertions_revision_id_assertion_id_key" ON "verified_fleet_membership_assertions"("revision_id", "assertion_id");
CREATE INDEX "verified_fleet_membership_assertions_silo_id_subject_id_scope_kind_organization_id_scope_resource_id_idx" ON "verified_fleet_membership_assertions"("silo_id", "subject_id", "scope_kind", "organization_id", "scope_resource_id");
CREATE UNIQUE INDEX "highest_accepted_fleet_memberships_revision_id_key" ON "highest_accepted_fleet_memberships"("revision_id");
CREATE UNIQUE INDEX "highest_membership_identity_key" ON "highest_accepted_fleet_memberships"("revision_id", "issuer_id", "silo_id", "revision");

ALTER TABLE "verified_fleet_membership_assertions" ADD CONSTRAINT "verified_fleet_membership_assertions_revision_id_silo_id_fkey" FOREIGN KEY ("revision_id", "silo_id") REFERENCES "verified_fleet_membership_revisions"("id", "silo_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "highest_accepted_fleet_memberships" ADD CONSTRAINT "highest_accepted_fleet_memberships_verified_identity_fkey" FOREIGN KEY ("revision_id", "issuer_id", "silo_id", "revision") REFERENCES "verified_fleet_membership_revisions"("id", "issuer_id", "silo_id", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_verified_membership_revision_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'VerifiedFleetMembershipRevision rows are immutable';
END;
$$;
CREATE TRIGGER "verified_fleet_membership_revisions_immutable" BEFORE UPDATE OR DELETE ON "verified_fleet_membership_revisions" FOR EACH ROW EXECUTE FUNCTION "reject_verified_membership_revision_mutation"();

CREATE FUNCTION "reject_verified_membership_assertion_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    assertion_issuer_id TEXT;
    assertion_revision INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT "issuer_id", "revision"
        INTO assertion_issuer_id, assertion_revision
        FROM "verified_fleet_membership_revisions"
        WHERE "id" = NEW."revision_id" AND "silo_id" = NEW."silo_id"
        FOR UPDATE;
        IF assertion_issuer_id IS NULL THEN
            RAISE EXCEPTION 'VerifiedFleetMembershipAssertion requires a verified revision';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM "highest_accepted_fleet_memberships"
            WHERE "issuer_id" = assertion_issuer_id
              AND "silo_id" = NEW."silo_id"
              AND "revision" >= assertion_revision
        ) THEN
            RAISE EXCEPTION 'accepted fleet membership assertions are sealed';
        END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'VerifiedFleetMembershipAssertion rows are immutable';
END;
$$;
CREATE TRIGGER "verified_fleet_membership_assertions_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "verified_fleet_membership_assertions" FOR EACH ROW EXECUTE FUNCTION "reject_verified_membership_assertion_mutation"();

CREATE FUNCTION "enforce_highest_membership_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    verified_at TIMESTAMP(3);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'HighestAcceptedFleetMembership rows cannot be deleted';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW."issuer_id" IS DISTINCT FROM OLD."issuer_id"
            OR NEW."silo_id" IS DISTINCT FROM OLD."silo_id" THEN
            RAISE EXCEPTION 'fleet membership high-watermark key is immutable';
        END IF;
        IF NEW."revision" <= OLD."revision"
            OR NEW."revision_id" IS NOT DISTINCT FROM OLD."revision_id" THEN
            RAISE EXCEPTION 'fleet membership replacement must be a strictly newer verified revision';
        END IF;
        IF NEW."accepted_at" < OLD."accepted_at" THEN
            RAISE EXCEPTION 'fleet membership accepted_at cannot move backward';
        END IF;
    END IF;
    SELECT revision_row."verified_at" INTO verified_at
    FROM "verified_fleet_membership_revisions" AS revision_row
    WHERE revision_row."id" = NEW."revision_id"
      AND revision_row."issuer_id" = NEW."issuer_id"
      AND revision_row."silo_id" = NEW."silo_id"
      AND revision_row."revision" = NEW."revision"
    FOR UPDATE;
    IF verified_at IS NULL OR verified_at > NEW."accepted_at" THEN
        RAISE EXCEPTION 'fleet membership high-watermark requires a verified revision for the same issuer and silo';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "highest_accepted_fleet_memberships_monotonic" BEFORE INSERT OR UPDATE OR DELETE ON "highest_accepted_fleet_memberships" FOR EACH ROW EXECUTE FUNCTION "enforce_highest_membership_revision"();
