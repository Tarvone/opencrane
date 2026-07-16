import { EgressDomainValidation } from "../models/data-network.types.js";

/** One valid DNS label without leading or trailing hyphens. */
const EGRESS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Validate and normalize an exact or leading-wildcard egress host. */
export function _ValidateEgressDomain(candidate: string, existingDomains: readonly string[]): EgressDomainValidation
{
	const normalizedDomain = candidate.toLowerCase();
	if (candidate.length === 0) return { normalizedDomain: null, error: "Enter a domain." };
	if (candidate !== candidate.trim() || /\s/.test(candidate)) return { normalizedDomain: null, error: "Domains cannot contain whitespace." };
	if (normalizedDomain.includes("://") || /[/:?#]/.test(normalizedDomain)) return { normalizedDomain: null, error: "Enter a host without a scheme, port, path, query, or fragment." };

	const host = normalizedDomain.startsWith("*.") ? normalizedDomain.slice(2) : normalizedDomain;
	if (normalizedDomain.includes("*") && !normalizedDomain.startsWith("*.")) return { normalizedDomain: null, error: "Wildcards are only allowed as a leading *." };
	const labels = host.split(".");
	if (host.length > 253 || labels.length < 2 || labels.some(function invalid(label): boolean { return !EGRESS_LABEL_PATTERN.test(label); }))
	{
		return { normalizedDomain: null, error: "Enter a valid host such as api.example.com or *.example.com." };
	}
	if (existingDomains.some(function duplicate(domain): boolean { return domain.toLowerCase() === normalizedDomain; }))
	{
		return { normalizedDomain: null, error: "This domain is already allowlisted." };
	}
	return { normalizedDomain, error: null };
}
