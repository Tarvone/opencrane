import type { AgentRevisionId, AgentRunId, AgentServiceId, PersonaRevisionId, SiloId, UserId } from "@opencrane/models/agents";

/** Immutable proof-bound assignment consumed by an agent runtime Pod. */
export interface RuntimeAssignment
{
  /** Run authorized for this assignment. */
  runId: AgentRunId;
  /** AgentService authorized for this assignment. */
  agentServiceId: AgentServiceId;
  /** Immutable AgentRevision authorized for this assignment. */
  agentRevisionId: AgentRevisionId;
  /** Approved persona revision compiled for the run, when personal. */
  personaRevisionId?: PersonaRevisionId;
  /** Silo in which the assignment is valid. */
  siloId: SiloId;
  /** User whose membership and grants authorized the run. */
  subjectUserId: UserId;
  /** Highest verified fleet-membership revision used for authorization. */
  fleetMembershipRevision: number;
  /** Digest of the effective proof-bound capability set. */
  capabilitySetDigest: string;
  /** Expected Kubernetes service account name. */
  serviceAccountName: string;
  /** Expected runtime Pod UID. */
  podUid: string;
  /** Digest of canonical assignment claims. */
  assignmentDigest: string;
  /** ISO-8601 issuance time. */
  issuedAt: string;
  /** ISO-8601 hard expiry time. */
  expiresAt: string;
}
