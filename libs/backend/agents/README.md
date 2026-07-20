# Agents — the personal-agent product domains

> [backend](../README.md) › agents

These packages hold the state and rules for the **personal-agent product**: the OpenCrane feature
that gives each employee their own agent. Everything under `personal/` is that agent's *own*
state — the conversations it has had, what it has learned, who it is configured to be, and each
attempt it makes at a task. This is deliberately distinct from [`libs/backend/server`](../server/README.md),
which is the operator **control plane** (who may act, tenancy, gateways, billing); the domains here
are the per-employee agent looking after itself, not the operator looking after the fleet.

## Map

| Package | What it owns |
| --- | --- |
| [`personal/conversations`](./personal/conversations/main/README.md) | Append-only run-event history. |
| [`personal/memory`](./personal/memory/main/README.md) | Memory fact catalog. |
| [`personal/personas`](./personal/personas/main/README.md) | Persona approval process. |
| [`personal/runs`](./personal/runs/main/README.md) | Agent-run attempt authority. |

```
              backend/agents/personal   (one employee's agent)
   ┌────────────────┬───────────────┬──────────────┬──────────────┐
 runs           conversations     memory        personas
 (attempts)     (event history)   (learned facts) (who it is)
```

## Dependency rule for this tier

Each domain carries `layer:backend` and its own scope (`scope:personal-runs`,
`scope:personal-conversations`, `scope:personal-memory`, `scope:personal-personas`). A domain may
import the shared models it needs — the agent model (`scope:agents`), and for runs the
authorization model, for memory the artifacts model — plus shared contracts (`scope:shared`) and
its own scope. It may **not** import a sibling `personal-*` domain or any control-plane
(`libs/backend/server`) domain. Cross-domain contact happens above, in the app that composes them.
Never import an app.

## See also

- Parent index: [`libs/backend`](../README.md)
- Sibling group: [`libs/backend/server`](../server/README.md) (the operator control plane) · [`libs/backend/artifacts`](../artifacts/README.md)
