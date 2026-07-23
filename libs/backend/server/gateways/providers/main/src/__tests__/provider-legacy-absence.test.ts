import { describe, expect, it } from "vitest";

import { _ProvidersOpenapiPaths } from "../openapi.js";

describe("provider API contract", () =>
{
	it("does not publish the retired plaintext provider-key routes", () =>
	{
		expect(_ProvidersOpenapiPaths).not.toHaveProperty("/providers/keys");
		expect(_ProvidersOpenapiPaths).not.toHaveProperty("/providers/keys/{provider}");
	});
});
