/** Address of a single namespaced custom resource + the manifest to write. */
export interface CustomObjectRef
{
  /** API group, e.g. `cert-manager.io`. */
  group: string;
  /** API version, e.g. `v1`. */
  version: string;
  /** Namespace the object lives in. */
  namespace: string;
  /** Plural resource name, e.g. `certificates`. */
  plural: string;
  /** Object name. */
  name: string;
  /** Desired manifest (its `metadata.resourceVersion` is overwritten with the live one). */
  manifest: Record<string, unknown>;
}
