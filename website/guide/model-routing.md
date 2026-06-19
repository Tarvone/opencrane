# Model routing & auto-routing

::: tip In plain terms
Not every task needs your best (most expensive) model. **Model routing** lets you pick the
right model for each kind of work — or let OpenCrane pick for you — and **prove a cheaper
model is just as good before you switch to it**. Less spend, same quality, and you approve
every change yourself.
:::

## What you can do

- **Use the right model for each job.** Pin a skill to a specific model, or let OpenCrane
  choose automatically.
- **Keep each customer to the models they're allowed.** A tenant can only call models you've
  granted them.
- **Prove savings before you commit.** Try a cheaper model against real example tasks, see
  how much you'd save and how confident the result is, and switch only if you approve.

Nothing changes silently. The platform *proposes*; a human *approves*.

## Pick a model per skill

Each skill can be **pinned** to a model you choose, or set to **auto** so OpenCrane picks the
default for that scope. Pin when you want predictability; use auto when you'd rather manage
the choice in one place.

```bash
oc skill-posture set <skill-key> --pinned-model my-fast-model   # always use this model
oc skill-posture set <skill-key> --auto                         # let the platform choose
oc skill-posture list
```

When a skill is on **auto**, the choice comes from a default you set once — for the whole
company, or per customer:

```bash
oc model-default set --model my-fast-model            # company-wide default
oc model-default set --cluster-tenant <id> --model …  # default for one customer
```

## Keep each customer to their allowed models

Every customer is confined to the models you've granted them. If a model isn't on their
list, their assistants simply can't call it — the boundary is enforced automatically, you
don't have to police it.

## Prove a cheaper model before you switch

This is the part that protects quality. Instead of guessing whether a cheaper model is
"good enough", you measure it:

1. **Give the skill a few example tasks** — the kind of thing it does day to day — with a
   quality bar each answer must clear.
2. **Run a measurement.** OpenCrane tries both your current model and the cheaper candidate
   on every example, has an independent model grade the answers, and reports **how much
   you'd save and how sure it is** of that number.
3. **Nothing changes.** A good result becomes a *suggestion* waiting for your approval — live
   traffic is never touched during a measurement.

```bash
# 1. Record example tasks for a skill
oc routing eval-case add --skill-name summarise --skill-scope org \
  --input '{"messages":[{"role":"user","content":"Summarise: …"}]}' \
  --expected "A two-sentence summary covering …" \
  --quality-bar 0.8

# 2. Try a cheaper model against them
oc routing measurement run --skill-name summarise --candidate-model my-cheap-model

# 3. See the result
oc routing measurement list --skill-name summarise
```

## Approve or reject — you decide

A measurement that shows real savings turns into a ranked suggestion. You review it and
choose; nothing is ever applied on its own.

```bash
oc routing recommendation list      # ranked "save up to N%" suggestions
oc routing proposal approve <id>    # switch the skill to the cheaper model
oc routing proposal reject <id>     # leave everything exactly as-is
```

Approving switches the skill and records the decision in the [audit log](/guide/audit);
rejecting changes nothing.

## See cost & quality at a glance

```bash
oc routing metrics
```

Operators see the whole fleet; everyone else sees only their own usage. Credentials stay on
the server — the browser never holds them.

---

## How it works (the details)

You don't need this to use routing day to day — it's here when you want to understand
exactly what the platform does.

### Registering models

A model is routable once it's in the registry. Each entry maps a public slug to an upstream
model and the provider credential behind it. Models and credentials are scoped **Global** or
**per-ClusterTenant**, and a credential only ever stores a Kubernetes Secret *reference* — a
raw API key is never written to the database.

```bash
oc model add --name my-cheap-model --upstream openai/gpt-4o-mini --credential <id>
oc model list / show <id> / update <id> / remove <id>
```

### How the effective model is resolved

At call time the control plane walks this precedence and writes the winner into the tenant's
effective contract — **no pod restart**:

```
explicit request override
  → skill-pinned model
    → skill auto-config
      → ClusterTenant default
        → Global default
```

### How the allowlist is enforced

Each tenant's LiteLLM virtual key carries a `models[]` allowlist, populated from the registry
at key-mint time and kept in sync by the operator's reconcile loop. A call to a model outside
the allowlist is rejected at the gateway.

### How measurement estimates savings

A run replays every eval case through both the **baseline** and the **candidate**, grades each
output with an independent **judge** model, reads the real per-call USD cost from LiteLLM, and
estimates the saving with a bootstrap **95% confidence interval**. A proposal is emitted *only*
when that interval excludes zero.

The measurement seams are **live** — they require a deployed LiteLLM, provider keys, and a
`ROUTING_JUDGE_MODEL`. With any unset, a run is a safe no-op. Full operator recipe:
[`docs/operators/routing-measurement.md`](https://github.com/italanta/opencrane/blob/main/docs/operators/routing-measurement.md).

::: warning Trust the judge, but verify it
Keep the judge model independent of the candidate's family — a model graded by a sibling of
itself scores too highly. LLM-as-judge grading also carries position and verbosity bias, so
calibrate against a small human-graded slice before trusting the absolute savings figure.
:::

## See also

- [Manage cost](/guide/budgets) — budgets and provider selection
- [Review activity](/guide/audit) — every routing decision is recorded
- [Telemetry & logging](/operators/telemetry-logging) — where the cost and quality data comes from
