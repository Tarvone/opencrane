/**
 * Kubernetes CRD constants used by the OpenCrane server's routers, controllers, and
 * drift detection. The API group, version, and resource names have one local authority.
 */

/** Kubernetes API group for OpenCrane custom resources. */
export const OPENCRANE_API_GROUP = "opencrane.io";

/** Kubernetes API version for OpenCrane custom resources. */
export const OPENCRANE_API_VERSION = "v1alpha1";

/** Plural resource name for the Tenant CRD. */
export const TENANT_CRD_PLURAL = "tenants";

/** Plural resource name for the AccessPolicy CRD. */
export const ACCESS_POLICY_CRD_PLURAL = "accesspolicies";

/** Plural resource name for the cluster-scoped ClusterTenant CRD. */
export const CLUSTER_TENANT_CRD_PLURAL = "clustertenants";
