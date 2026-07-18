/** Immutable reference to a published capability catalog revision. */
export interface CapabilityCatalogReference
{
	/** Stable catalog identifier. */
	catalogId: string;
	/** Positive, monotonically increasing catalog revision. */
	revision: number;
	/** Digest binding the reference to the exact catalog payload. */
	digest: string;
}

/** Reference to one capability in an immutable catalog revision. */
export interface CapabilityReference
{
	/** Immutable catalog revision that defines the capability. */
	catalog: CapabilityCatalogReference;
	/** Stable capability identifier inside the referenced catalog. */
	capabilityId: string;
}
