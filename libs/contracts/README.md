# @opencrane/contracts — the control-plane API contract and typed client

> [OpenCrane](../../README.md) › contracts

## What it owns

This package is the **contract** between the OpenCrane server (the control plane) and everything that
calls it — the built-in web app and any external, proprietary frontend. A "contract" here is the
shared, versioned definition of the HTTP API: the request/response shapes (DTOs — data transfer
objects) and the enums that both sides agree on, plus a ready-made typed client that speaks it.

Two halves:

- **The typed client.** `___CreateControlPlaneClient(baseUrl, token)` returns an
  [`openapi-fetch`](https://github.com/openapi-ts/openapi-fetch) client whose method and path types
  come from `generated/api.ts` — TypeScript generated from the server's OpenAPI 3.1 specification.
  Because the types are generated from the same spec the server emits, a call that would 404 or send
  the wrong body fails to compile rather than at runtime.
- **The shared DTOs and enums.** Some are hand-written here (grants, groups, cluster-tenant,
  MCP-server, model-routing, memory, approvals, …); others are **re-exported straight from the model
  packages** (`@opencrane/models/{agents,artifacts,authorization,platform-policy}`) so a caller has
  one import for the whole surface and the wire types stay identical to the domain types.

```
 apps/opencrane server ....... emits OpenAPI 3.1 spec (dist/apps/opencrane/openapi.json)
        │  openapi-typescript
        ▼
 ┌────────────────────────────┐
 │   contracts  ◄── HERE       │  generated types + DTOs + ___CreateControlPlaneClient
 └────────────────────────────┘
        │  typed client + shared types
        ▼
 in-repo web app  ·  external frontends (via the released spec, see below)
```

**In this flow:** [models/agents](../models/agents/main/README.md) · [models/authorization](../models/authorization/main/README.md) *(re-exported DTOs)* · the `apps/opencrane` server *(spec producer)*

Invariant: the client's types are a faithful projection of the server's published spec — regenerate
after any API change so the two never silently diverge.

## Public surface

- `___CreateControlPlaneClient`, `ControlPlaneClient`, `paths` — the typed HTTP client and its path map.
- Hand-written DTOs/enums: `Grant`/`GrantScope`/`GrantAccess`, `Group`, `ClusterTenant*`,
  `McpServer*`/`Mcp*` operator types (MCP — the Model Context Protocol for connecting external tools),
  model-routing types, `Memory*`, `Approval`, `ThirdPartySource*`, `RuntimeAssignment`,
  `RunInputSnapshot`, `TenantModelSet`, domain-topology host builders.
- `AGENT_RUNTIME_PROTOCOL_V1`, `AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE`,
  `___IsAgentRuntimeServiceAccountName`,
  `RuntimeCommandEnvelope`, and `RuntimeCandidate` — transport-neutral
  command and candidate frames for a runtime that opens its own authenticated stream to the control
  plane. The audience constant fixes that workload identity to `opencrane-agent-runtime`; the shared
  validator keeps Job issuance and TokenReview admission on one bounded ServiceAccount grammar.
  These frames are not a browser or OpenAPI contract.
- Re-exported model types: the agent, artifact, authorization, and platform-policy DTOs.

## Boundary

The one contract surface for the control-plane API; frontends import it instead of hard-coding URLs
or shapes. It defines types and builds a client — it holds no business logic, no persistence, and no
server state. External proprietary frontends should generate their own client from the released spec
(see below) rather than importing this package, keeping a clean process/network boundary.

## Licensing

This package is licensed under **MIT** (see [`LICENSE`](./LICENSE)), unlike the rest of the platform,
which is AGPL-3.0-or-later. This is a deliberate relicensing by the copyright owner so external
consumers — including proprietary frontends — can use the generated client and types without
inheriting AGPL obligations. The MIT grant covers only the contents of this `libs/contracts/`
directory.

## Consuming the contract from an external project

You do **not** need to import this package to build a client. The control plane publishes its OpenAPI
spec two ways:

- at runtime: `GET /api/v1/openapi.json`
- as a **release asset** named `openapi.json` on each tagged OpenCrane release.

External frontends should pin a released `openapi.json` and run `openapi-typescript` against it. That
keeps a clean process/network boundary and avoids linking against any AGPL code:

```bash
# Pin a specific OpenCrane release, then generate a typed client locally.
curl -fsSL -o openapi/opencrane.json \
  https://github.com/<org>/opencrane/releases/download/<tag>/openapi.json
npx openapi-typescript openapi/opencrane.json -o src/api/generated.ts
```

## Dependency direction

Tagged `scope:shared` (`layer:contract`): it may depend on the shared model packages it re-exports
and other shared packages — never on apps, backend domains, or the frontend/server layers.

## See also

- Parent index: [OpenCrane](../../README.md)
- Siblings: [util](../util/README.md) · [observability](../observability/README.md)
- Re-exported models: [models/agents](../models/agents/main/README.md) · [models/artifacts](../models/artifacts/main/README.md) · [models/authorization](../models/authorization/main/README.md) · [models/platform-policy](../models/platform-policy/main/README.md)
