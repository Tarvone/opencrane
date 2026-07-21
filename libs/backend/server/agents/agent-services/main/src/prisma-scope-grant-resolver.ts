import type { PrismaClient } from "@prisma/client";

import { compileForPrincipals, GrantCompilerAccess, GrantCompilerPayloadType, GrantCompilerScope, GrantCompilerSubjectType } from "@opencrane/backend/server/iam/grants";
import type { CompiledGrantDecision } from "@opencrane/backend/server/iam/grants";
import type { GrantScope, GrantSubjectType } from "@opencrane/models/agents";

import type { EffectiveScopeGrant, ScopeGrantResolver } from "./scope-attachment-authority.types.js";

/** Maps a compiler scope enum to the canonical scope-attachment vocabulary. */
function _scope(value: GrantCompilerScope): GrantScope
{
	switch (value)
	{
		case GrantCompilerScope.Org: return "org";
		case GrantCompilerScope.Department: return "department";
		case GrantCompilerScope.Team: return "team";
		case GrantCompilerScope.Project: return "project";
		case GrantCompilerScope.Personal: return "personal";
	}
}

/** Maps a compiler subject-type enum to the canonical scope-attachment vocabulary. */
function _subjectType(value: GrantCompilerSubjectType): GrantSubjectType
{
	switch (value)
	{
		case GrantCompilerSubjectType.Group: return "group";
		case GrantCompilerSubjectType.Tenant: return "tenant";
		case GrantCompilerSubjectType.User: return "user";
	}
}

/**
 * Grant-compiler-backed effective-scope resolver.
 *
 * This is the REAL grant-compiler import that justifies re-opening the `scope:grants` edge on
 * `scope:agent-services`. It compiles Awareness (knowledge-scope) grants for the given principals and
 * keeps only the ALLOW winners, projecting each to the `{ scope, subjectType, subjectId }` triple an
 * attachment declares. Deny/absent scopes never appear, so an attachment intersected against this set
 * can only be filtered, never widened.
 */
export class PrismaScopeGrantResolver implements ScopeGrantResolver
{
	/** OpenCrane product-authority database client. */
	private readonly prisma: PrismaClient;

	/**
	 * Creates a resolver over canonical Postgres.
	 * @param prisma - OpenCrane Prisma client.
	 */
	constructor(prisma: PrismaClient)
	{
		this.prisma = prisma;
	}

	/** Compiles the allow-only effective knowledge-scope grants for the principal set. */
	async resolveEffectiveScopeGrants(principalIds: readonly string[]): Promise<readonly EffectiveScopeGrant[]>
	{
		const decisions: CompiledGrantDecision[] = await compileForPrincipals([...principalIds], GrantCompilerPayloadType.Awareness, this.prisma);
		return decisions
			.filter(decision => decision.access === GrantCompilerAccess.Allow)
			.map(decision => ({ scope: _scope(decision.scope), subjectType: _subjectType(decision.subjectType), subjectId: decision.subjectId }));
	}
}
