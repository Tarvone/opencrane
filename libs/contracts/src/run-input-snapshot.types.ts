import type { AgentRevisionId, AgentRunId, AgentServiceId, MessageId, PersonaRevisionId, ThreadId } from "@opencrane/models/agents";
import type { ArtifactRevisionId, SkillRevisionId } from "@opencrane/models/artifacts";
import type { MemoryFactReference } from "./memory.types.js";

/** Deterministic, immutable inputs compiled before a runtime assignment. */
export interface RunInputSnapshot
{
  /** Run receiving the snapshot. */
  runId: AgentRunId;
  /** AgentService receiving the run. */
  agentServiceId: AgentServiceId;
  /** Immutable AgentRevision being executed. */
  agentRevisionId: AgentRevisionId;
  /** Thread supplying ordered conversation history. */
  threadId: ThreadId;
  /** Ordered persisted messages included in the prompt. */
  messageIds: MessageId[];
  /** Approved persona revision compiled into the prompt, when personal. */
  personaRevisionId?: PersonaRevisionId;
  /** Immutable artifact revisions made available to the run. */
  artifactRevisionIds: ArtifactRevisionId[];
  /** Immutable skill revisions made available to the run. */
  skillRevisionIds: SkillRevisionId[];
  /** Scoped durable memory facts included in the prompt. */
  memoryFacts: MemoryFactReference[];
  /** Highest verified fleet-membership revision used for authorization. */
  fleetMembershipRevision: number;
  /** Digest of the effective proof-bound capability set. */
  capabilitySetDigest: string;
  /** SHA-256 digest of the complete canonical snapshot in `sha256:<hex>` form. */
  digest: string;
  /** ISO-8601 compilation time. */
  compiledAt: string;
}
