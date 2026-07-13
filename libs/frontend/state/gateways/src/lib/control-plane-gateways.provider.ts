import { Provider } from "@angular/core";

import { CONVERSATION_GATEWAY } from "@weownai/state/core";
import { OpenClawConversationGateway } from "@weownai/state/conversation/adapter";
import { OpenCraneSettingsGateway, SETTINGS_GATEWAY } from "@weownai/state/settings/adapter";
import { OpenCraneUserTenantGateway, USER_TENANT_GATEWAY } from "@weownai/state/tenant/adapter";
import { MCP_GATEWAY, OpenCraneMcpGateway } from "@weownai/state/mcp/adapter";
import { OpenCraneProviderKeyGateway, PROVIDER_KEY_GATEWAY } from "@weownai/state/provider-key/adapter";

import { GATEWAY_MODE } from "./gateway-mode.types";

/**
 * Binds every swappable data gateway the **control-plane** app (org-admin
 * console) consumes to their live OpenCrane implementations. All targets are on
 * the Control Plane API (per-tenant/org surface).
 *
 * All gateways are live — there is no mock mode in production code. To test
 * with in-memory fakes use `provideTestGateways` from the `__test__` package.
 *
 * @returns The DI providers to spread into the app's `providers` array.
 */
export function provideControlPlaneGateways(): Provider[]
{
	return [
		{ provide: GATEWAY_MODE, useValue: "live" },
		{ provide: CONVERSATION_GATEWAY, useClass: OpenClawConversationGateway },
		{ provide: SETTINGS_GATEWAY, useClass: OpenCraneSettingsGateway },
		{ provide: USER_TENANT_GATEWAY, useClass: OpenCraneUserTenantGateway },
		{ provide: MCP_GATEWAY, useClass: OpenCraneMcpGateway },
		{ provide: PROVIDER_KEY_GATEWAY, useClass: OpenCraneProviderKeyGateway }
	];
}
