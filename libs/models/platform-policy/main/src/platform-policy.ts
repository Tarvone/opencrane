import type { DurableStatePolicy, PlatformPolicy, RuntimeFilesystemPolicy, RuntimeWorkspaceClearEvent, SiloUpdatePolicy } from "./platform-policy.types.js";

/** Strict upper bound for one silo update; an allowed duration must be less than five minutes. */
export const ___MAXIMUM_SILO_UPDATE_DURATION_MS = 300_000;

/** Required scratch-workspace clearing events in deterministic order. */
export const ___RUNTIME_WORKSPACE_CLEAR_EVENTS = ["replacement", "scale-zero", "lease-expiry"] as const satisfies readonly RuntimeWorkspaceClearEvent[];

/** Adopted target platform policy for canonical state and runtime filesystems. */
export const ___PLATFORM_POLICY = {
	durableState: {
		retention: "until-authorized-deletion",
		storage: "persistent",
		expansion: "online",
		alertBeforeExhaustion: true,
		expandBeforeExhaustion: true,
		backup: "required",
	},
	runtimeFilesystem: {
		rootAuthority: "non-authoritative",
		rootAccess: "read-only-when-supported",
		workspaceAuthority: "non-authoritative-scratch",
		workspaceLifetime: "lease-scoped",
		workspaceBackup: "never",
		clearWorkspaceOn: ___RUNTIME_WORKSPACE_CLEAR_EVENTS,
	},
	siloUpdate: {
		maximumDurationExclusiveMs: ___MAXIMUM_SILO_UPDATE_DURATION_MS,
		volumeHandling: "remount-existing",
		stateHandling: "resume-canonical",
		predecessorRuntime: "forbidden",
		predecessorDataTransformation: "forbidden",
	},
} as const satisfies PlatformPolicy;

/** Determine whether an unknown value is a record with inspectable fields. */
function _isRecord(value: unknown): value is Record<string, unknown>
{
	return typeof value === "object" && value !== null;
}

/** Determine whether a durable-state policy preserves canonical state safely. */
export function ___IsDurableStatePolicy(value: unknown): value is DurableStatePolicy
{
	return _isRecord(value)
		&& value["retention"] === "until-authorized-deletion"
		&& value["storage"] === "persistent"
		&& value["expansion"] === "online"
		&& value["alertBeforeExhaustion"] === true
		&& value["expandBeforeExhaustion"] === true
		&& value["backup"] === "required";
}

/** Determine whether a scratch-workspace policy contains every required clearing event exactly once. */
export function ___IsRuntimeFilesystemPolicy(value: unknown): value is RuntimeFilesystemPolicy
{
	if (!_isRecord(value) || !Array.isArray(value["clearWorkspaceOn"]))
	{
		return false;
	}

	const clearEvents = new Set(value["clearWorkspaceOn"]);
	return value["rootAuthority"] === "non-authoritative"
		&& value["rootAccess"] === "read-only-when-supported"
		&& value["workspaceAuthority"] === "non-authoritative-scratch"
		&& value["workspaceLifetime"] === "lease-scoped"
		&& value["workspaceBackup"] === "never"
		&& clearEvents.size === ___RUNTIME_WORKSPACE_CLEAR_EVENTS.length
		&& ___RUNTIME_WORKSPACE_CLEAR_EVENTS.every(function _hasRequiredEvent(event)
		{
			return clearEvents.has(event);
		});
}

/** Determine whether an update policy resumes target-owned state without a predecessor runtime. */
export function ___IsSiloUpdatePolicy(value: unknown): value is SiloUpdatePolicy
{
	return _isRecord(value)
		&& value["maximumDurationExclusiveMs"] === ___MAXIMUM_SILO_UPDATE_DURATION_MS
		&& value["volumeHandling"] === "remount-existing"
		&& value["stateHandling"] === "resume-canonical"
		&& value["predecessorRuntime"] === "forbidden"
		&& value["predecessorDataTransformation"] === "forbidden";
}

/** Determine whether a complete platform policy satisfies every adopted target invariant. */
export function ___IsPlatformPolicy(value: unknown): value is PlatformPolicy
{
	return _isRecord(value)
		&& ___IsDurableStatePolicy(value["durableState"])
		&& ___IsRuntimeFilesystemPolicy(value["runtimeFilesystem"])
		&& ___IsSiloUpdatePolicy(value["siloUpdate"]);
}

/** Determine whether one silo update finishes strictly within the five-minute product bound. */
export function ___IsSiloUpdateDurationAllowed(durationMs: number): boolean
{
	return Number.isFinite(durationMs)
		&& durationMs >= 0
		&& durationMs < ___MAXIMUM_SILO_UPDATE_DURATION_MS;
}
