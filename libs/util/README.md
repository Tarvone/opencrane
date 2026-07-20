# @opencrane/util — dependency-free pure helpers

> [OpenCrane](../../README.md) › util

## What it owns

The smallest shared library in the platform: a handful of **pure, dependency-free helpers** used
across domain packages. "Pure" means every function returns a value computed only from its
arguments — no database, no network, no clock, no global state — so the results are identical every
time and safe to call anywhere.

It owns two things:

- **Collection helpers** — `___SortBy` (stable sort by an optional key), `___SomeArray` and
  `___SomeRecord` (typed "does any element/value match?" checks). Small, but shared so the same
  behaviour is used everywhere rather than re-implemented.
- **Canonical JSON and digest grammar** — `___CanonicalizeJson` serialises a JSON value to the one canonical string
  form defined by RFC 8785 (JSON Canonicalization Scheme): object keys sorted, whitespace and number
  formatting fixed. Two values that are equal produce byte-identical text, which is what makes a
  stable hash possible. `___CloneCanonicalJson` creates a detached copy through that canonical form,
  while `___IsSha256Digest` recognises the one lowercase, algorithm-prefixed spelling the platform
  accepts. The type `CanonicalJsonSha256Digest` is the template-literal string type
  `` `sha256:${string}` `` — an explicitly encoded digest, so a hash of canonical bytes is never
  confused with an arbitrary string.

Widely used where a **deterministic** result matters — most importantly the authorization model,
which digests capability catalogues and request arguments so a signature can bind to exact bytes.
Cross-cutting exports carry the `___` (triple-underscore) prefix to mark them as intentional
platform-wide API. Invariant: purity and determinism — no hidden inputs, same output every time.

## Public surface

- `___SortBy`, `___SomeArray`, `___SomeRecord` — collection helpers.
- `___CanonicalizeJson` — RFC 8785 canonical JSON serialisation.
- `___CloneCanonicalJson` — deterministic deep copy for JSON crossing an ownership boundary.
- `___IsSha256Digest` — fail-closed validator for canonical `sha256:` digest strings.
- `JsonValue`, `JsonPrimitive`, `CanonicalJsonSha256Digest` — JSON and digest types.

## Boundary

Pure and dependency-free: it may not import any other package, and it does no I/O. It provides
building blocks; calculating a hash and any storage stay with the caller. The clone accepts only JSON
values, and the digest helper validates spelling rather than proving that a digest matches content.

## Dependency direction

Tagged `scope:shared`: it may never import from a domain package or an app — the leaf everything else
is allowed to depend on.

## See also

- Parent index: [OpenCrane](../../README.md)
- Siblings: [observability](../observability/README.md) · [contracts](../contracts/README.md)
