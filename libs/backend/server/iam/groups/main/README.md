# @opencrane/backend/server/iam/groups — named sets of people you can grant access to at once

> [backend](../../../../README.md) › [server](../../../README.md) › [iam](../../README.md) › groups

## What it owns

This package is part of **IAM** — *identity and access management*, the side of OpenCrane that
answers **who is making this request, and are they allowed to do this?** Groups owns the idea of a
named set of people — a team, a department, a project — so that access can be given to the whole set
at once instead of one person at a time.

A group is the *subject* a grant can point at: instead of "give Ana and Ben and Cara access", you say
"give the design-team group access", and everyone in the group inherits it. This package owns the
operator-facing group management API (`/api/v1/groups`) and the stored membership that backs it. Some
groups mirror the login groups a person's identity provider reports (kept in sync at sign-in by the
[identity](../../identity/main/README.md) package); others are curated by operators here.

```
 identity mirrors a person's login groups  ──┐
 operator curates groups via /api/v1/groups ─┤
        ▼                                     ▼
 ┌───────────────────────────────┐
 │   groups   ◄── HERE            │  store named sets + their members
 └───────────────────────────────┘
        │  a group is used as the SUBJECT of a grant
        ▼
  grants ......... expands the group to its members when it compiles access
```

**In this flow:** [identity](../../identity/main/README.md) · [grants](../../grants/main/README.md)

Invariant: a group is only a set of members plus its grants — it makes no access decision itself.
Whether membership in a group actually allows something is decided later, when [grants](../../grants/main/README.md)
compiles the group's members against its grants. Mounted at `/api/v1/groups`.

## Public surface

- `groupsRouter` and its route types — the `/api/v1/groups` management API.
- The group logic in `core/groups.logic` — create, update, and grant-attachment operations, plus the
  response shapes.
- `_GroupsOpenapiPaths` — the OpenAPI path fragment this domain contributes to the aggregated spec.

## Boundary

Consumed by the server's HTTP composition root and by [api-spec](../../../api-spec/main/README.md).
It owns group definitions and their members; it deliberately does not resolve effective access — that
is [grants](../../grants/main/README.md), which reads group membership as an input.

## Dependency direction

Tagged `scope:groups`: it may depend only on `scope:groups` and `scope:shared` — never on apps or
other sibling domains.

## Data & persistence

Owns the `Group` model in `apps/opencrane/prisma/schema/groups.prisma`.

## See also

- Parent index: [iam](../../README.md)
- Siblings: [grants](../../grants/main/README.md) · [identity](../../identity/main/README.md) · [policies](../../policies/main/README.md)
