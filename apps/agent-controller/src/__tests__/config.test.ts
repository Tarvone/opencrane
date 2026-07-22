import { describe, expect, it } from "vitest";

import { _ReadConfig } from "../config.js";

/** Return one Helm-equivalent immutable profile JSON value. */
function _ProfilesJson(namespace = "silo-a"): string
{
	return JSON.stringify({
		"personal-default": {
			image: "ghcr.io/italanta/opencrane-agent-runtime@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			imagePullPolicy: "IfNotPresent",
			runtimeStreamUrl: `http://opencrane-server.${namespace}.svc.cluster.local:3001/api/internal/agent-runtime`,
			serverNamespace: namespace,
			serviceAccountName: "agent-runtime-default",
			releaseSelectorLabels: { "app.kubernetes.io/name": "opencrane-silo", "app.kubernetes.io/instance": "opencrane" },
			serverPort: 3001,
			projectedTokenTtlSeconds: 600,
			scratchSize: "64Mi",
			activeDeadlineSeconds: 900,
			ttlSecondsAfterFinished: 300,
			resources: { requests: { cpu: "25m", memory: "64Mi" }, limits: { cpu: "250m", memory: "128Mi" } },
		},
	});
}

/** Return the minimal complete process environment. */
function _Environment(): NodeJS.ProcessEnv
{
	return { OPENCRANE_INTERNAL_URL: "http://opencrane-server.silo-a.svc.cluster.local:3001", OPENCRANE_CONTROLLER_TOKEN_PATH: "/var/run/opencrane/tokens/opencrane.token", AGENT_CONTROLLER_KUBERNETES_TOKEN_PATH: "/var/run/secrets/kubernetes.io/serviceaccount/token", AGENT_CONTROLLER_NAMESPACE: "silo-a", AGENT_CONTROLLER_POLL_INTERVAL_MS: "1000", AGENT_CONTROLLER_PROFILES_JSON: _ProfilesJson() };
}

describe("agent-controller process config", function _Suite()
{
	it("loads the explicit token paths, namespace, and validated immutable profiles", function _Loads()
	{
		const config = _ReadConfig(_Environment());
		expect(config.namespace).toBe("silo-a");
		expect(config.controllerTokenPath).toBe("/var/run/opencrane/tokens/opencrane.token");
		expect(config.kubernetesTokenPath).toBe("/var/run/secrets/kubernetes.io/serviceaccount/token");
		expect(config.requestTimeoutMilliseconds).toBe(10_000);
		expect(config.profiles["personal-default"]?.serviceAccountName).toBe("agent-runtime-default");
	});

	it("rejects another namespace, moving image tag, or nonstandard Kubernetes token mount", function _RejectsUnsafeConfig()
	{
		expect(function _OtherNamespace() { _ReadConfig({ ..._Environment(), AGENT_CONTROLLER_PROFILES_JSON: _ProfilesJson("silo-b") }); }).toThrow(/targets another namespace/);
		expect(function _MovingImage() { _ReadConfig({ ..._Environment(), AGENT_CONTROLLER_PROFILES_JSON: _ProfilesJson().replace(/@sha256:[a-f0-9]{64}/, ":latest") }); }).toThrow(/immutable image/);
		expect(function _OtherKubernetesToken() { _ReadConfig({ ..._Environment(), AGENT_CONTROLLER_KUBERNETES_TOKEN_PATH: "/tmp/token" }); }).toThrow(/must be \/var\/run\/secrets/);
	});
});
