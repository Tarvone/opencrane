# TASK-CODEX-TEST-LAYOUT — reconstruct the D4 `__tests__/` layout enforcement (→ Codex)

Mission. Bring the D4 test-layout convention forward onto the current base. The old PR #303
(`feat/phase-d-reintegrate-d4-readmes`) carried this but is unmergeable: its 33 test-moves target the
**flat** `libs/backend/server/<domain>` paths that PR #306 (merged) regrouped into
`<group>/<domain>`. Reconstruct on top of `own-personal-ai-agent-setup` instead of merging #303.
Branch `feat/phase-d-test-layout` is already created off the current base for this.

#303's other commit ("document backend capability boundaries") is SUPERSEDED by #306's group READMEs
+ `libs/backend/README.md` — do NOT reintroduce it. Only the test-layout enforcement is still wanted.

## The convention

Every `*.test.ts` in the repo must live under a `__tests__/` directory. Enforced by a custom ESLint
rule (independent of Vitest discovery) so a misplaced test fails lint, not just test collection.

## Step 1 — add the enforcement (clean, no conflicts)

**`eslint.config.mjs`** — add this rule object near the top of the module, then add the flat-config
block. Verbatim from the original #303 commit b657abb:

```js
/** Enforces the package test-layout convention independently of Vitest discovery. */
const testLayout = {
  rules: {
    "require-tests-directory": {
      meta: {
        type: "problem",
        docs: { description: "require TypeScript tests to live below __tests__" },
        schema: [],
        messages: { misplacedTest: "Move this test below a __tests__ directory." },
      },
      create(context) {
        const filename = context.filename.replaceAll("\\", "/");
        if (filename.includes("/__tests__/")) {
          return {};
        }
        return {
          Program(node) {
            context.report({ node, messageId: "misplacedTest" });
          },
        };
      },
    },
  },
};
```

And append this block to the exported flat-config array (after the existing blocks):

```js
  {
    files: ["**/*.test.ts"],
    plugins: { "test-layout": testLayout },
    rules: { "test-layout/require-tests-directory": "error" },
  },
```

**`nx.json`** — in the `production` (or equivalent) namedInput that lists test exclusions, DROP the
`"!{projectRoot}/**/*.test.ts"` entry and KEEP `"!{projectRoot}/src/__tests__/**"`. After the move,
all tests live under `src/__tests__/`, so the single directory exclusion covers them; the loose
glob becomes redundant. (Original diff removed exactly that one line.)

## Step 2 — move every co-located test (the rule is GLOBAL: `**/*.test.ts`)

The base has **37** co-located tests repo-wide (not just backend — models, server/_infra, and 2 apps
too). ALL must move or lint breaks. Full list captured at
`/private/tmp/.../scratchpad/colocated-tests.txt`; regenerate authoritatively with:

```bash
git ls-tree -r --name-only HEAD | grep -E '\.test\.ts$' | grep -v '__tests__'
```

For each hit `.../<dir>/X.test.ts`, move to `.../<dir>/__tests__/X.test.ts` via `git mv` (create the
`__tests__` dir). Run the loop from a **bash script file** invoked with `bash script.sh`, NOT inline
— the interactive shell here is zsh (`set -- $x` does not word-split; `grep`/`ls` exit-1 under
`set -euo pipefail` kills the script — guard with `|| true`).

After moving, fix each moved test's relative imports: a test that imported `./foo` or `../bar` now
sits one level deeper, so `./foo` → `../foo`, `../bar` → `../../bar`, etc. Imports via the
`@opencrane/*` path aliases are unaffected. Some packages already have a `__tests__/` dir with a
correct `../` depth — moving a sibling co-located test in beside them uses the same depth. Verify by
compiling, not by eye.

Watch for per-package `vitest.config.ts` `include`/`dir` globs that assume `src/*.test.ts`; update
any that would now miss `src/__tests__/`.

## Step 3 — app-source topology guard (this is what broke #303's CI)

Two of the moved tests are under app roots, governed by `docs/agents/app-source-allowlist.json`:
- `apps/opencrane/src/infra/artifacts/artifact-upload.factory.test.ts`
  → `apps/opencrane/src/infra/artifacts/__tests__/artifact-upload.factory.test.ts`
- `apps/artifact-service/src/server.test.ts`
  → `apps/artifact-service/src/__tests__/server.test.ts`

Update BOTH `path` entries in the allowlist to the new `__tests__/` paths. Then run
`bash scripts/phase-b-topology.sh` — it must pass (the guard rejects stale allowlist entries AND
unregistered app sources, so both the old path removal and the new path addition are required).

## Step 4 — validation gate (all must pass)

- `npx nx run-many -t lint` across all projects — the new `test-layout` rule must report ZERO
  misplaced tests (this proves the sweep is complete).
- `npx nx run-many -t test` across affected — proves relative-import fixups and vitest configs.
- `bash scripts/phase-b-topology.sh` and `bash scripts/agent-style-check.sh`.
- `git ls-tree -r --name-only HEAD | grep -E '\.test\.ts$' | grep -v '__tests__'` → returns NOTHING.

## Step 5 — finish

- Delete this file in the final commit.
- Push `feat/phase-d-test-layout`; open PR → `own-personal-ai-agent-setup`.
- Close #303 as superseded, with a comment: test-layout reconstructed on the post-regroup base in the
  new PR; the "backend capability boundaries" guide is already covered by #306's group READMEs.
