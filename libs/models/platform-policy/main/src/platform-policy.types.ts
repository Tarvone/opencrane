/** Events that end a runtime scratch-workspace lease. */
export type RuntimeWorkspaceClearEvent = "lease-expiry" | "replacement" | "scale-zero";

/** Policy for canonical durable product state. */
export interface DurableStatePolicy
{
	/** Canonical state remains indefinitely until an authorized deletion. */
	readonly retention: "until-authorized-deletion";
	/** Canonical state is mounted on persistent storage. */
	readonly storage: "persistent";
	/** Persistent storage supports expansion while online. */
	readonly expansion: "online";
	/** Capacity alerts must fire before storage is exhausted. */
	readonly alertBeforeExhaustion: true;
	/** Capacity must be expanded before storage is exhausted. */
	readonly expandBeforeExhaustion: true;
	/** Canonical durable state is included in backups. */
	readonly backup: "required";
}

/** Policy for the runtime's non-authoritative filesystem surfaces. */
export interface RuntimeFilesystemPolicy
{
	/** Runtime root files never become product authority. */
	readonly rootAuthority: "non-authoritative";
	/** Runtime root files are read-only whenever the runtime supports it. */
	readonly rootAccess: "read-only-when-supported";
	/** The workspace is non-authoritative scratch space. */
	readonly workspaceAuthority: "non-authoritative-scratch";
	/** The workspace exists only for the active runtime lease. */
	readonly workspaceLifetime: "lease-scoped";
	/** Scratch workspace content is never included in backups. */
	readonly workspaceBackup: "never";
	/** Every event that must clear the scratch workspace. */
	readonly clearWorkspaceOn: readonly RuntimeWorkspaceClearEvent[];
}

/** Policy for upgrading a silo while preserving canonical target-owned state. */
export interface SiloUpdatePolicy
{
	/** Strict exclusive duration bound of five minutes for one silo update. */
	readonly maximumDurationExclusiveMs: 300000;
	/** Existing persistent volumes are remounted rather than transformed. */
	readonly volumeHandling: "remount-existing";
	/** The new runtime resumes canonical target-owned state. */
	readonly stateHandling: "resume-canonical";
	/** A predecessor runtime is never started as an update fallback. */
	readonly predecessorRuntime: "forbidden";
	/** Existing canonical data is never transformed for a predecessor runtime. */
	readonly predecessorDataTransformation: "forbidden";
}

/** Complete platform persistence, filesystem, and update policy. */
export interface PlatformPolicy
{
	/** Canonical durable-state policy. */
	readonly durableState: DurableStatePolicy;
	/** Non-authoritative runtime-filesystem policy. */
	readonly runtimeFilesystem: RuntimeFilesystemPolicy;
	/** Silo update and recovery policy. */
	readonly siloUpdate: SiloUpdatePolicy;
}
