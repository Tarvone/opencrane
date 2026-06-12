/** Parameters for minting a tenant-pod access token via the K8s TokenRequest API. */
export interface PodTokenMintParams
{
	/** Kubernetes namespace the tenant ServiceAccount lives in. */
	namespace: string;

	/** Name of the tenant pod ServiceAccount (e.g. `openclaw-alex.oc`). */
	serviceAccountName: string;

	/** Audience the minted token is bound to (the Obot MCP Gateway). */
	audience: string;

	/** Token lifetime in seconds. */
	expirationSeconds: number;
}

/** Result of a successful pod-token mint. */
export interface PodTokenResult
{
	/** The short-lived, audience-bound bearer token. */
	token: string;

	/** ISO-8601 expiry timestamp returned by the API server. */
	expiresAt: string;
}
