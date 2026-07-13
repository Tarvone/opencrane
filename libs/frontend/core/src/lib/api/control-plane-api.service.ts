import { Injectable, inject } from "@angular/core";

import type { paths } from "./generated/control-plane";
import { CONTROL_PLANE_BASE_URL } from "./api-client.types";
import { OpenCraneApiClientBase } from "./api-client.base";

/**
 * Typed HTTP client for the OpenCrane **Control Plane** API (per-tenant/org
 * surface: `/auth`, `/tenants`, `/mcp`, `/models`, `/policies`, …).
 *
 * Generated from the pinned OpenAPI contract in
 * `openapi/opencrane-control-plane.json` (see `pnpm sync-spec`); WeOwnAI never
 * imports OpenCrane application code — the network contract is the only coupling.
 * All feature data access must flow through services in `core/api`.
 *
 * Auth helpers (`signIn`/`signInUrl`, the 401→login middleware) and the untyped
 * `request()` escape hatch come from {@link OpenCraneApiClientBase}; this surface
 * owns the org-admin OIDC session.
 */
@Injectable({ providedIn: "root" })
export class ControlPlaneApiService extends OpenCraneApiClientBase<paths>
{
	public constructor()
	{
		super(inject(CONTROL_PLANE_BASE_URL, { optional: true }) ?? "");
	}
}
