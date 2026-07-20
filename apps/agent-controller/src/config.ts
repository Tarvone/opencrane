import { isAbsolute } from "node:path";

import { __ValidateAgentControllerRuntimeProfiles } from "@opencrane/backend/agents/runtime/controller";

import type { AgentControllerProcessConfig } from "./config.types.js";

/** Standard path read by Kubernetes client-node's in-cluster configuration. */
const _KUBERNETES_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token";

/** Read one required, trimmed environment value. */
function _Required(environment: NodeJS.ProcessEnv, name: string): string
{
	const value = environment[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}

/** Parse a bounded safe integer or use its explicit default. */
function _Integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number
{
	const raw = environment[name];
	const value = raw === undefined ? fallback : Number(raw);
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
	{
		throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
	}
	return value;
}

/** Parse JSON while converting syntax errors into a stable configuration failure. */
function _Json(value: string): unknown
{
	try
	{
		return JSON.parse(value) as unknown;
	}
	catch
	{
		throw new Error("AGENT_CONTROLLER_PROFILES_JSON must contain valid JSON");
	}
}

/** Read and fail-closed validate the complete agent-controller process configuration. */
export function _ReadConfig(environment: NodeJS.ProcessEnv = process.env): AgentControllerProcessConfig
{
	// 1. Fix the controller to one namespace and the standard explicit Kubernetes token mount.
	const namespace = _Required(environment, "AGENT_CONTROLLER_NAMESPACE");
	const kubernetesTokenPath = environment.AGENT_CONTROLLER_KUBERNETES_TOKEN_PATH?.trim() || _KUBERNETES_TOKEN_PATH;
	if (kubernetesTokenPath !== _KUBERNETES_TOKEN_PATH)
	{
		throw new Error(`AGENT_CONTROLLER_KUBERNETES_TOKEN_PATH must be ${_KUBERNETES_TOKEN_PATH}`);
	}

	// 2. Require the separately audience-bound OpenCrane credential by mounted path, never raw value.
	const controllerTokenPath = _Required(environment, "OPENCRANE_CONTROLLER_TOKEN_PATH");
	if (!isAbsolute(controllerTokenPath))
	{
		throw new Error("OPENCRANE_CONTROLLER_TOKEN_PATH must be absolute");
	}

	// 3. Validate all immutable profiles at startup through the canonical Job/NetworkPolicy builder.
	const profiles = __ValidateAgentControllerRuntimeProfiles(_Json(_Required(environment, "AGENT_CONTROLLER_PROFILES_JSON")), namespace);
	return {
		openCraneInternalUrl: _Required(environment, "OPENCRANE_INTERNAL_URL"),
		controllerTokenPath,
		kubernetesTokenPath,
		namespace,
		pollIntervalMilliseconds: _Integer(environment, "AGENT_CONTROLLER_POLL_INTERVAL_MS", 1_000, 100, 60_000),
		requestTimeoutMilliseconds: _Integer(environment, "AGENT_CONTROLLER_REQUEST_TIMEOUT_MS", 10_000, 1_000, 60_000),
		profiles,
	};
}
