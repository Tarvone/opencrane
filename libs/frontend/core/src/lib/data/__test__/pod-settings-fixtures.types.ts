/** Editable values owned by the fixture-backed Pod settings form. */
export interface PodSettingsDraftFixture
{
	/** Workspace name presented throughout the product. */
	readonly displayName: string;
	/** OpenCrane release selected for the Pod. */
	readonly version: string;
	/** Whether patch releases should be applied automatically. */
	readonly autoUpdate: boolean;
}

/** One read-only storage statistic from the Pod handoff. */
export interface PodStorageStatFixture
{
	/** Short statistic heading. */
	readonly label: string;
	/** Human-readable statistic value. */
	readonly value: string;
}

/** Complete deterministic presentation model for Workspace Pod settings. */
export interface PodSettingsFixture
{
	/** Operator-assigned Pod identifier. */
	readonly podId: string;
	/** Latest OpenCrane release available to the Pod. */
	readonly latestVersion: string;
	/** Read-only storage statistics. */
	readonly storageStats: readonly PodStorageStatFixture[];
	/** Editable baseline values. */
	readonly draft: PodSettingsDraftFixture;
}
