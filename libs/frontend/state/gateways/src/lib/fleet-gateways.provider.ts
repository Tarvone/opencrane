import { Provider } from "@angular/core";

import { CLUSTER_TENANT_GATEWAY, OpenCraneClusterTenantGateway } from "@weownai/state/cluster-tenant/adapter";
import { MockPaymentGateway, PAYMENT_GATEWAY, BILLING_ACCOUNT_GATEWAY, OpenCraneBillingAccountGateway } from "@weownai/state/billing/adapter";
import { OpenCraneUserTenantGateway, USER_TENANT_GATEWAY } from "@weownai/state/tenant/adapter";

import { GATEWAY_MODE } from "./gateway-mode.types";

/**
 * Binds every swappable data gateway the **fleet** app (platform-operator
 * console) consumes to their live OpenCrane implementations. Cluster-tenant
 * provisioning targets the Fleet Manager API; the user-tenant read uses the
 * Control Plane API (the gateway picks its own client).
 *
 * Exception: `PAYMENT_GATEWAY` stays on the in-memory mock because no live PSP
 * implementation exists yet (milestone LIVE.5). It is the only gateway without
 * a real backend counterpart.
 *
 * @returns The DI providers to spread into the app's `providers` array.
 */
export function provideFleetGateways(): Provider[]
{
	return [
		{ provide: GATEWAY_MODE, useValue: "live" },
		{ provide: CLUSTER_TENANT_GATEWAY, useClass: OpenCraneClusterTenantGateway },
		// Payment gateway intentionally stays mock: no live PSP yet (LIVE.5).
		{ provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
		{ provide: BILLING_ACCOUNT_GATEWAY, useClass: OpenCraneBillingAccountGateway },
		{ provide: USER_TENANT_GATEWAY, useClass: OpenCraneUserTenantGateway }
	];
}
