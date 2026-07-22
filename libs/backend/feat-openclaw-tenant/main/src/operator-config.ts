import { createHash } from "node:crypto";

import type { OpenClawTenantOperatorConfig } from "./operator-config.types.js";

/**
 * Hash the reconcile-affecting operator configuration deterministically.
 * @param config - Frozen-blue tenant operator configuration.
 * @returns Stable SHA-256 digest used by the reconcile guard.
 */
export function _OperatorConfigChecksum(config: OpenClawTenantOperatorConfig): string
{
  const canonical = JSON.stringify(config, Object.keys(config).sort());
  return createHash("sha256").update(canonical).digest("hex");
}
