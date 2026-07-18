import type { AgentRevisionId, AgentServiceId, SiloId } from "./identifiers.types.js";

/** Product role performed by an agent service. */
export type AgentServiceKind = "personal" | "managed";

/** Lifecycle state of a stable agent service identity. */
export type AgentServiceState = "draft" | "active" | "paused" | "retired";

/** Independent containment dimensions supported by agent ownership. */
export type AgentOwnerScope = "organization" | "department" | "team" | "project" | "personal" | "user";

/** Owner of an agent service within one explicit containment dimension. */
export interface AgentOwner
{
	/** Containment dimension under which the owner is resolved. */
	readonly scope: AgentOwnerScope;
	/** Identifier meaningful within the selected containment dimension. */
	readonly subjectId: string;
}

/** Stable product identity for a personal or managed agent. */
export interface AgentService
{
	/** Stable agent-service identifier. */
	readonly id: AgentServiceId;
	/** Silo that owns the service. */
	readonly siloId: SiloId;
	/** Product role performed by the service. */
	readonly kind: AgentServiceKind;
	/** Human-readable service name shown in product surfaces. */
	readonly name: string;
	/** Explicit owner, including its independent containment dimension. */
	readonly owner: AgentOwner;
	/** Current lifecycle state. */
	readonly state: AgentServiceState;
	/** Immutable revision activated for new runs, or null before publication. */
	readonly activeRevisionId: AgentRevisionId | null;
	/** Named workload profile used to project runtime policy. */
	readonly workloadProfile: string;
	/** ISO-8601 instant at which the service was created. */
	readonly createdAt: string;
	/** ISO-8601 instant at which the service state last changed. */
	readonly updatedAt: string;
}
