import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from "@angular/core";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { providePrimeNG } from "primeng/config";

import { WeOwnAiPreset } from "@opencrane/core";
import { CONVERSATION_CACHE, PLATFORM_SURFACE } from "@opencrane/state/core";
import { IndexedDbConversationCache } from "@opencrane/state/conversation/cache";
import { UserTenantStore } from "@opencrane/state/tenant/adapter";
import { LOCAL_STORAGE_GATEWAY, SESSION_STORAGE_GATEWAY, WebLocalStorageAdapter, WebSessionStorageAdapter } from "@opencrane/state/utils/storage";
import { provideControlPlaneGateways } from "@opencrane/state/gateways";
import { provideWebPlatform } from "@opencrane/platform";
import { SessionStore } from "@opencrane/state/core";
import { provideTestGateways } from "@opencrane/state/gateways/testing";

import { environment } from "../environments/environment.js";
import { APP_ROUTES } from "./app.routes.js";
import { MockSessionStore } from "@opencrane/state/core/testing";

/**
 * Root application configuration for the WeOwnAI frontend.
 *
 * Change detection is zoneless: the app is fully signal-driven with OnPush
 * components, so zone.js is not bundled (see the empty polyfills in the build).
 * The web PlatformBridge is provided here; a desktop app swaps in its own.
 */
export const appConfig: ApplicationConfig =
{
	providers:
	[
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(APP_ROUTES, withComponentInputBinding()),
		provideHttpClient(withFetch()),
		provideAnimationsAsync(),
		providePrimeNG({ theme: { preset: WeOwnAiPreset } }),
		provideWebPlatform(),
		{ provide: LOCAL_STORAGE_GATEWAY, useClass: WebLocalStorageAdapter },
		{ provide: SESSION_STORAGE_GATEWAY, useClass: WebSessionStorageAdapter },
		// This app is the org/customer surface — capabilities derive from the
		// org-admin claim only (platform-operator claims grant nothing here).
		{ provide: PLATFORM_SURFACE, useValue: "org" },
		// Swappable data gateways are selected from one environment flag
		// (mock in dev, live in prod) — see provideControlPlaneGateways.
		...(environment.gatewayMode === "mock" ? provideTestGateways() : provideControlPlaneGateways()),
		// Web local-transcript cache; a desktop build binds this token to a
		// filesystem/SQLite store instead (see ConversationCache).
		{ provide: CONVERSATION_CACHE, useClass: IndexedDbConversationCache },
		// Use the mock identity store for the UI handoff.
		{ provide: SessionStore, useClass: MockSessionStore },
		// UserTenant store for the customer-admin console (not a gateway).
		UserTenantStore
	]
};
