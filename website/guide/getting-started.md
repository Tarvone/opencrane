# Install OpenCrane

OpenCrane is **plain Kubernetes**. If you can run a Kubernetes cluster, you can run
OpenCrane — there's no special cloud dependency. Pick the path that fits you:

| Path | Best for | Guide |
|------|----------|-------|
| **Local, VM or VPS** | Trying it out, a demo, or a small team on a single machine | [Local, VM or VPS →](/guide/deploy-local) |
| **Cluster** | Production, scale, high availability | [Cluster deployment →](/guide/deploy-cluster) |

Both install the same way — the only difference is the size and shape of the
Kubernetes underneath.

## Connect to the management API

The management UI signs operators in through OIDC and makes same-origin requests with its
session cookie. There is no static API token to copy into a terminal. Use the UI for operator
actions and the [interactive API reference](/reference/api) to inspect the same contract.

For TypeScript integrations, use the generated client described in the
[Contracts SDK](/integrators/contracts-sdk).

## Then

1. **[Set up your domain](/guide/dns)** — point DNS at OpenCrane and turn on HTTPS.
2. **[Create your first assistant](/guide/first-tenant)**.
3. **[Connect to OpenClaw](/guide/connect)**.
