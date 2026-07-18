/**
 * Linkerd mesh-injection constants used by the OpenCrane server.
 *
 * The namespace-injection annotation opts a namespace's pods into the Linkerd
 * mesh (sidecar + workload identity). It lives in `@opencrane/server/_infra/api`
 * because server-side namespace builders and silo policy reconcilers must stamp
 * one identical value and field ownership contract.
 */

/** The namespace-injection annotation that opts a namespace's pods into the Linkerd mesh. */
export const LINKERD_INJECT_ANNOTATION = "linkerd.io/inject";

/** The annotation value enabling automatic sidecar/identity injection. */
export const LINKERD_INJECT_ENABLED = "enabled";
