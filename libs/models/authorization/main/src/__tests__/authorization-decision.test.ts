import { describe, expect, it } from "vitest";
import { __DecideAuthorization } from "../authorization-decision.js";
import type { AuthorizationScope } from "../authorization-scope.types.js";
import type { CapabilityReference } from "../capability.types.js";
import type { AuthorizationGrant, AuthorizationRequest } from "../grant.types.js";
import { __AuthorizationScopesEqual } from "../scope-matching.js";

/** Capability used by the grant decision table. */
const CAPABILITY: CapabilityReference = {
	catalog: { catalogId: "core", revision: 4, digest: "sha256:catalog-4" },
	capabilityId: "artifact.read",
};

/** Project target shared by most decision cases. */
const PROJECT_SCOPE: AuthorizationScope = {
	kind: "project",
	organizationId: "org-a",
	projectId: "project-shared",
};

/** Request shared by most decision cases. */
const REQUEST: AuthorizationRequest = {
	siloId: "silo-a",
	subjectId: "user-a",
	scope: PROJECT_SCOPE,
	capability: CAPABILITY,
};

/**
 * Creates a grant with explicit overrides for one decision case.
 * @param overrides - Fields that replace the valid baseline grant.
 * @returns Authorization grant for the requested capability.
 */
function _grant(overrides: Partial<AuthorizationGrant> = {}): AuthorizationGrant
{
	return {
		grantId: "grant-a",
		siloId: "silo-a",
		subjectId: "user-a",
		scope: PROJECT_SCOPE,
		capability: CAPABILITY,
		effect: "allow",
		priority: 10,
		...overrides,
	};
}

describe("authorization grant decision table", function ()
{
	it("allows a matching project grant", function ()
	{
		expect(__DecideAuthorization(REQUEST, [_grant()])).toEqual({
			outcome: "allow",
			reason: "winning_allow",
			grantIds: ["grant-a"],
			winningPriority: 10,
		});
	});

	it("allows organization scope to cover a project in the same organization", function ()
	{
		const decision = __DecideAuthorization(REQUEST, [_grant({
			scope: { kind: "organization", organizationId: "org-a" },
		})]);

		expect(decision.outcome).toBe("allow");
	});

	it("keeps project independent from department scope", function ()
	{
		const decision = __DecideAuthorization(REQUEST, [_grant({
			scope: { kind: "department", organizationId: "org-a", departmentId: "project-shared" },
		})]);

		expect(decision).toEqual({ outcome: "deny", reason: "no_matching_grant", grantIds: [] });
	});

	it("keeps project independent from team scope", function ()
	{
		const decision = __DecideAuthorization(REQUEST, [_grant({
			scope: { kind: "team", organizationId: "org-a", teamId: "project-shared" },
		})]);

		expect(decision.reason).toBe("no_matching_grant");
	});

	it("keeps personal and direct-user scopes distinct", function ()
	{
		const directRequest: AuthorizationRequest = {
			...REQUEST,
			scope: { kind: "direct-user", organizationId: "org-a", userId: "user-b" },
		};
		const decision = __DecideAuthorization(directRequest, [_grant({
			scope: { kind: "personal", organizationId: "org-a", userId: "user-b" },
		})]);

		expect(decision.reason).toBe("no_matching_grant");
	});

	it("matches a direct-user grant only to the addressed user", function ()
	{
		const directRequest: AuthorizationRequest = {
			...REQUEST,
			scope: { kind: "direct-user", organizationId: "org-a", userId: "user-b" },
		};
		const decision = __DecideAuthorization(directRequest, [_grant({
			scope: { kind: "direct-user", organizationId: "org-a", userId: "user-b" },
		})]);

		expect(decision.outcome).toBe("allow");
	});

	it("rejects grants from another organization, silo, or subject", function ()
	{
		const grants = [
			_grant({ grantId: "org", scope: { kind: "organization", organizationId: "org-b" } }),
			_grant({ grantId: "silo", siloId: "silo-b" }),
			_grant({ grantId: "subject", subjectId: "user-b" }),
		];

		expect(__DecideAuthorization(REQUEST, grants).reason).toBe("no_matching_grant");
	});

	it("requires an exact immutable capability catalog reference", function ()
	{
		const grants = [
			_grant({ grantId: "catalog", capability: { ...CAPABILITY, catalog: { ...CAPABILITY.catalog, catalogId: "other" } } }),
			_grant({ grantId: "revision", capability: { ...CAPABILITY, catalog: { ...CAPABILITY.catalog, revision: 3 } } }),
			_grant({ grantId: "digest", capability: { ...CAPABILITY, catalog: { ...CAPABILITY.catalog, digest: "sha256:other" } } }),
			_grant({ grantId: "capability", capability: { ...CAPABILITY, capabilityId: "artifact.write" } }),
		];

		expect(__DecideAuthorization(REQUEST, grants).reason).toBe("no_matching_grant");
	});

	it("lets a higher-priority allow replace a lower-priority deny", function ()
	{
		const decision = __DecideAuthorization(REQUEST, [
			_grant({ grantId: "low-deny", effect: "deny", priority: 10 }),
			_grant({ grantId: "high-allow", effect: "allow", priority: 20 }),
		]);

		expect(decision).toEqual({
			outcome: "allow",
			reason: "winning_allow",
			grantIds: ["high-allow"],
			winningPriority: 20,
		});
	});

	it("lets a higher-priority deny replace a lower-priority allow", function ()
	{
		const decision = __DecideAuthorization(REQUEST, [
			_grant({ grantId: "low-allow", effect: "allow", priority: 10 }),
			_grant({ grantId: "high-deny", effect: "deny", priority: 20 }),
		]);

		expect(decision.outcome).toBe("deny");
		expect(decision.grantIds).toEqual(["high-deny"]);
	});

	it("makes deny win when allow and deny share the highest priority", function ()
	{
		const decision = __DecideAuthorization(REQUEST, [
			_grant({ grantId: "equal-allow", effect: "allow", priority: 20 }),
			_grant({ grantId: "equal-deny", effect: "deny", priority: 20 }),
			_grant({ grantId: "low-allow", effect: "allow", priority: 10 }),
		]);

		expect(decision).toEqual({
			outcome: "deny",
			reason: "winning_deny",
			grantIds: ["equal-allow", "equal-deny"],
			winningPriority: 20,
		});
	});

	it("fails closed when a matching priority cannot be ordered safely", function ()
	{
		const decision = __DecideAuthorization(REQUEST, [
			_grant({ grantId: "valid", priority: 10 }),
			_grant({ grantId: "invalid", priority: Number.NaN }),
		]);

		expect(decision).toEqual({
			outcome: "deny",
			reason: "invalid_grant_priority",
			grantIds: ["invalid"],
		});
	});

	it("treats organization coverage as directional rather than scope equality", function ()
	{
		const organizationScope: AuthorizationScope = { kind: "organization", organizationId: "org-a" };

		expect(__AuthorizationScopesEqual(organizationScope, PROJECT_SCOPE)).toBe(false);
		expect(__AuthorizationScopesEqual(PROJECT_SCOPE, PROJECT_SCOPE)).toBe(true);
	});
});
