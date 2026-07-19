-- Direct target replacement: remove the retired routing-measurement authority.
-- These objects were created by migrations 0018–0021 and have no target schema owner.
DROP TABLE IF EXISTS "routing_proposals";
DROP TABLE IF EXISTS "mrl_eval_cases";
DROP TABLE IF EXISTS "mrl_measurements";
DROP TYPE IF EXISTS "RoutingProposalStatus";
DROP TYPE IF EXISTS "SkillModelMode";
