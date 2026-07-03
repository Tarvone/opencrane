import { AwarenessClient } from "@opencrane/awareness";

/**
 * The subset of process env the org-memory MCP server reads at startup.
 * Modelled as an index map (not a named-optional interface) so `process.env`
 * assigns cleanly without TypeScript's weak-type check tripping.
 */
export type OrgMemoryEnv = Record<string, string | undefined>;

/**
 * Build the {@link AwarenessClient} the MCP server retrieves through, from pod env.
 *
 * COGNEE_ENDPOINT is mandatory: the server exists only to serve Cognee-backed org
 * memory, so a missing endpoint is a hard error (fail loud at startup) — never a
 * silent no-op that would leave the agent believing it queried org memory when it
 * did not. This mirrors the control-plane's "COGNEE_ENDPOINT is required" contract.
 *
 * @param env - The environment to read (defaults to `process.env` at the call site).
 * @returns A configured AwarenessClient that retrieves directly from the per-tenant Cognee.
 * @throws When COGNEE_ENDPOINT is unset/blank.
 */
export function _BuildAwarenessClientFromEnv(env: OrgMemoryEnv): AwarenessClient
{
  const endpoint = env.COGNEE_ENDPOINT?.trim();
  if (!endpoint)
  {
    throw new Error("COGNEE_ENDPOINT is required for the org-memory MCP server");
  }

  const parsedLimit = env.ORG_MEMORY_DEFAULT_LIMIT ? Number.parseInt(env.ORG_MEMORY_DEFAULT_LIMIT, 10) : NaN;
  const defaultLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

  return new AwarenessClient({ cogneeEndpoint: endpoint, ...(defaultLimit ? { defaultLimit } : {}) });
}
