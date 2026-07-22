import type { AuthorizationScope } from "./authorization-scope.types.js";

/** One signed claim that a subject belongs to a silo and authorization scope. */
export interface FleetMembershipAssertion
{
	/** Stable assertion identifier referenced by authorization evaluation. */
	assertionId: string;
	/** Stable silo identifier asserted for the subject. */
	siloId: string;
	/** Stable subject identifier whose membership is asserted. */
	subjectId: string;
	/** Exact independent authorization scope asserted for the subject. */
	scope: AuthorizationScope;
}

/** Fleet-issued and signed membership snapshot. */
export interface SignedFleetMembershipRevision
{
	/** Positive, monotonically increasing revision issued by the fleet. */
	revision: number;
	/** Stable identity of the fleet issuer. */
	issuerId: string;
	/** Stable identifier of the issuer key used for verification. */
	issuerKeyId: string;
	/** Stable silo identifier covered by this revision. */
	siloId: string;
	/** Epoch-millisecond time at which this revision was issued. */
	issuedAtEpochMs: number;
	/** Epoch-millisecond time after which this revision is invalid. */
	expiresAtEpochMs: number;
	/** Digest of the exact signed revision payload. */
	payloadDigest: string;
	/** Opaque signature bound to the signed revision payload. */
	signature: string;
	/** Membership assertions covered by the signed payload. */
	assertions: readonly FleetMembershipAssertion[];
}

/** Explicit evidence produced by a trusted signature verifier. */
export interface FleetSignatureVerificationEvidence
{
	/** Whether cryptographic signature verification succeeded. */
	verified: boolean;
	/** Issuer identity that the verifier bound to the signature. */
	issuerId: string;
	/** Issuer key identity that the verifier used. */
	issuerKeyId: string;
	/** Revision number bound by the verified payload. */
	revision: number;
	/** Silo identifier bound by the verified payload. */
	siloId: string;
	/** Payload digest bound by the verified signature. */
	payloadDigest: string;
	/** Opaque signature value checked by the verifier. */
	signature: string;
}

/** Expected trust boundary for accepting a signed fleet membership revision. */
export interface FleetMembershipTrustExpectation
{
	/** Fleet issuer that is trusted for this evaluation. */
	trustedIssuerId: string;
	/** Silo in which the subject is expected to be a member. */
	siloId: string;
	/** Subject expected in the required assertion. */
	subjectId: string;
	/** Stable identifier of the required signed assertion. */
	assertionId: string;
	/** Exact scope expected in the required assertion. */
	scope: AuthorizationScope;
	/** Current epoch-millisecond time supplied by the caller. */
	nowEpochMs: number;
	/** Highest fleet membership revision previously accepted for this silo. */
	lastAcceptedRevision: number;
	/** Maximum permitted age of a signed revision in milliseconds. */
	maximumStalenessMs: number;
}

/** Stable reason for accepting or rejecting fleet membership evidence. */
export type FleetMembershipTrustReason =
	"trusted"
	| "invalid_time_policy"
	| "invalid_revision"
	| "revision_rollback"
	| "untrusted_issuer"
	| "signature_not_verified"
	| "verification_evidence_mismatch"
	| "silo_mismatch"
	| "invalid_issued_at"
	| "invalid_expiry"
	| "not_yet_valid"
	| "expired"
	| "stale"
	| "assertion_mismatch";

/** Fail-closed fleet membership trust result. */
export interface FleetMembershipTrustDecision
{
	/** Whether the signed membership revision may be trusted. */
	outcome: "trusted" | "denied";
	/** Stable reason explaining the trust result. */
	reason: FleetMembershipTrustReason;
	/** Revision evaluated at the trust boundary. */
	revision: number;
	/** Earliest epoch-millisecond boundary after which trust must fail closed. */
	trustedUntilEpochMs?: number;
}
