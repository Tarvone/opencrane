import type { AgentControllerRuntimeProfiles } from "@opencrane/backend/agents/runtime/controller";

/** Fully validated process configuration for the per-silo agent controller. */
export interface AgentControllerProcessConfig
{
	/** Internal OpenCrane origin used for claim and assignment calls. */
	readonly openCraneInternalUrl: string;
	/** Absolute path of the rotating OpenCrane-audience projected token. */
	readonly controllerTokenPath: string;
	/** Standard Kubernetes client token path projected explicitly by Helm. */
	readonly kubernetesTokenPath: string;
	/** Sole namespace this controller may mutate. */
	readonly namespace: string;
	/** Delay after an idle poll or handled error. */
	readonly pollIntervalMilliseconds: number;
	/** Hard timeout for one OpenCrane authority call. */
	readonly requestTimeoutMilliseconds: number;
	/** Immutable runtime profiles keyed by authority-owned profile name. */
	readonly profiles: AgentControllerRuntimeProfiles;
}
