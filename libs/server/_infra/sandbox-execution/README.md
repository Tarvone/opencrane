# @opencrane/server/_infra/sandbox-execution — the sandboxed tool-execution port

> [server](../../README.md) › [_infra](../README.md) › sandbox-execution

## What it owns

This library owns the **boundary for running one external tool call inside a sandboxed Kubernetes
Job**, instead of running it in the server process. A *sandboxed Job* is a short-lived, isolated
Kubernetes workload (a container that starts, does one thing, and exits) so untrusted tool code
never executes with the server's own privileges. This package is a **port** — a runtime-neutral
contract (a TypeScript interface) that says *what* execution operations exist, with the real
transport wired in elsewhere.

It sits between the run executor and the remote sandbox-execution authority:

```
 run executor  (an action step needs a tool call run)
          │  RunSandboxJobCommand  (run/attempt + write-only arguments)
          ▼
 ┌────────────────────────────────┐
 │  sandbox-execution  ◄── HERE    │  SandboxJobExecutor: runJob
 └────────────────────────────────┘
          │  SandboxJobResult  (executor-reported exit code + output + completion)
          ▼
 remote sandboxed Kubernetes Job
```

**In this flow:** the run executor *(sole consumer)* · the remote sandbox authority *(runs the Job
and reports the result)*

It owns: the `SandboxJobExecutor` interface (`runJob`); the request/result types where the tool
`arguments` are **write-only** (handed straight through, never persisted or logged by this boundary)
and the result carries only executor-originated output — the exit code, output, and completion time
the Job actually reported; and a **fail-closed** default implementation,
`__UnavailableSandboxJobExecutor`, which throws `SandboxExecutionUnavailableError` for every call.
That default ships until a real sandbox Job transport is wired, so no code path can fabricate a tool
result in the meantime. Invariant: a Job result is only ever real if the executor produced it — the
platform never synthesises one, and absent a working transport the answer is a hard failure, not a
placeholder.

This is a **port plus fail-closed stub only**. It adopts no external sandbox runtime (no OpenSandbox
adoption), ships no `apps/tool-runner`, and carries no real transport. The concrete executor is
wired in the `apps/opencrane` composition root once a Job transport is confirmed.

## Public surface

- `SandboxJobExecutor` — the runtime-neutral run-a-job contract.
- `RunSandboxJobCommand`, `SandboxJobResult` — the I/O types.
- `__UnavailableSandboxJobExecutor`, `SandboxExecutionUnavailableError` — the fail-closed default and its error.

## Boundary

Consumed by the run executor. It defines the execution contract and a safe default; it does not run
a Job itself yet — a concrete executor is wired in the `apps/opencrane` composition root when the
sandbox Job transport is confirmed. It stores nothing and holds no arguments beyond the single
in-flight call.

## Dependency direction

Tagged `scope:sandbox-execution` (`layer:infra`): it may depend only on `scope:sandbox-execution`
and `scope:shared` packages — never on backend domains, the frontend, or app entrypoints.

## See also

- Parent index: [_infra](../README.md) · [server libraries](../../README.md)
- Siblings: [api](../api/README.md) · [auth](../auth/README.md) · [http](../http/README.md) · [obot-custody](../obot-custody/README.md) · [tenant-hosting](../tenant-hosting/README.md) · [channel-proxy](../channel-proxy/README.md)
