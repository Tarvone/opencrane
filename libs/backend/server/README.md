# OpenCrane server capabilities

The OpenCrane server composes these backend capabilities. Directories group related authorities
without changing any NX project, scope tag, or dependency contract.

| Group | Shared concern | Members |
| --- | --- | --- |
| [`iam`](./iam/) | Who may act, and evidence of those decisions. | identity, membership, authorization, policies, grants, groups, access-tokens, audit |
| [`agents`](./agents/) | Managed-agent publication and execution inputs. | agent-services, skills, artifacts, channel-targets |
| [`gateways`](./gateways/) | Governance of external model and tool planes. | mcp, integrations, providers, model-routing |
| [`knowledge`](./knowledge/) | Organisational sources and retrieved knowledge. | retrieval, company-docs |
| [`tenancy`](./tenancy/) | Fleet-to-silo lifecycle and effective tenant state. | tenants, cluster-tenants, projection, contract, connections |
| [`reporting`](./reporting/) | Economics and operational/product observability. | metrics, spend, awareness |

[`api-spec`](./api-spec/main/) remains flat because it aggregates public paths from every group;
placing it in one group would imply ownership of those capabilities.

## Dependency direction

The grouping is a navigational map, not a new `scope:<group>` policy. Existing per-domain NX
scope constraints remain authoritative. This directory map does not impose group-level dependency
direction: current cross-group edges include IAM ↔ tenancy, tenancy → reporting, and reporting →
tenancy. New cross-group imports require an explicit domain-level decision.

Every package continues to expose only its public barrel at
`@opencrane/backend/server/<group>/<domain>`. Apps compose packages; packages never import apps.
