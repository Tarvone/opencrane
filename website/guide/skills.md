# Share skills across teams

OpenCrane is building **versioned, reviewed skills** that can be shared without trusting mutable
runtime-local files.

::: tip What's a skill?
A **reusable ability** you give to assistants — such as drafting a sales follow-up, reviewing a
pull request, or summarising a support ticket.
:::

::: info Foundation in progress
The ArtifactStore-backed publication authority is implemented, but the end-user catalogue,
authoring, and sharing API and UI are not mounted yet. The retired bundle-registry endpoints are not
a supported path.
:::

## What publication enforces

The current publication service accepts only an exact `SkillRevision` and `ArtifactRevision` pair.
It requires successful test and scan evidence, a signature and signer key, and a revision already in
review. It then publishes the revision and advances the skill's current pointer atomically.

The implementation lives in
[`libs/backend/server/skills/main`](https://github.com/italanta/opencrane/blob/main/libs/backend/server/skills/main).
The public product workflow will build on that authority rather than restoring an OCI bundle
registry or compatibility route.

## What comes next

The product surface still needs catalogue browsing, isolated authoring jobs, review and publication,
and governed sharing across personal, project, department and organisation scopes. Until those
surfaces are mounted, there is no supported end-user skill-publishing workflow.

> See also: [Control access](/guide/permissions) (how governed sharing is expressed) and
> [Architecture](/advanced/architecture) (where skills fit in the platform).
