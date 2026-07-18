/**
 * Root ESLint flat config — module-boundary enforcement only.
 *
 * Mechanical TypeScript style stays in `scripts/agent-style-check.sh` and per-package
 * `tsc --noEmit`; this config exists solely so the NX project graph can enforce the
 * legacy scope tags and the dimensional tags declared in each package.json
 * (`nx.tags`):
 *
 *   - `scope:shared`  (libs/* infra + contracts) may only depend on other shared libs.
 *   - `scope:backend` (libs/backend/*)           may depend on backend + shared libs.
 *   - `scope:web`     (libs/frontend/*)          may depend on web + shared libs.
 *   - `scope:app`     (apps/*)                   may depend on anything.
 *
 * Phase B started dimensional tags on every new or touched project. Untagged legacy targets are
 * direct-deletion/refactor debt, while newly tagged projects are prevented from introducing
 * app-to-app, lib-to-app, or upward layer dependencies now.
 *
 * Run via `npm run lint:boundaries`.
 */
import nx from "@nx/eslint-plugin";
import tsEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      ".claude/**",
      ".nx/**",
      "website/**",
      "libs/contracts/src/generated/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.mts"],
    languageOptions: { parser: tsParser },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    // typescript-eslint is registered ONLY so pre-existing inline
    // `eslint-disable @typescript-eslint/*` directives resolve; no rules enabled.
    plugins: { "@nx": nx, "@typescript-eslint": tsEslint },
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: false,
          allow: [],
          depConstraints: [
            {
              sourceTag: "scope:shared",
              onlyDependOnLibsWithTags: [
                "scope:shared",
                "scope:agents",
                "scope:artifacts",
                "scope:authorization",
                "scope:auth",
                "scope:channel-proxy",
                "scope:http",
                "scope:tenant-hosting",
              ],
            },
            {
              sourceTag: "scope:backend",
              onlyDependOnLibsWithTags: [
                "scope:backend",
                "scope:shared",
                "scope:api-spec",
                "scope:auth",
                "scope:channel-proxy",
                "scope:connections",
                "scope:contract",
                "scope:feat-openclaw-tenant",
                "scope:http",
                "scope:identity",
                "scope:policies",
                "scope:projection",
                "scope:tenant-hosting",
                "scope:tenants",
              ],
            },
            { sourceTag: "scope:web", onlyDependOnLibsWithTags: ["scope:web", "scope:shared"] },
            { sourceTag: "scope:app", onlyDependOnLibsWithTags: ["*"] },
            { sourceTag: "scope:agents", onlyDependOnLibsWithTags: ["scope:agents", "scope:shared"] },
            { sourceTag: "scope:artifacts", onlyDependOnLibsWithTags: ["scope:artifacts", "scope:shared"] },
            { sourceTag: "scope:authorization", onlyDependOnLibsWithTags: ["scope:authorization", "scope:shared"] },
            { sourceTag: "type:app", notDependOnLibsWithTags: ["type:app"] },
            { sourceTag: "type:lib", notDependOnLibsWithTags: ["type:app"] },
            {
              sourceTag: "layer:backend",
              notDependOnLibsWithTags: ["layer:entrypoint", "layer:frontend"],
            },
            {
              sourceTag: "layer:infra",
              notDependOnLibsWithTags: ["layer:entrypoint", "layer:backend", "layer:frontend"],
            },
            {
              sourceTag: "layer:frontend",
              notDependOnLibsWithTags: ["layer:entrypoint", "layer:backend", "layer:infra"],
            },
            {
              sourceTag: "layer:contract",
              notDependOnLibsWithTags: [
                "layer:entrypoint",
                "layer:backend",
                "layer:frontend",
                "layer:infra",
              ],
            },
            {
              sourceTag: "layer:model",
              notDependOnLibsWithTags: [
                "layer:entrypoint",
                "layer:backend",
                "layer:contract",
                "layer:frontend",
                "layer:infra",
              ],
            },
            {
              sourceTag: "layer:util",
              notDependOnLibsWithTags: [
                "layer:entrypoint",
                "layer:backend",
                "layer:contract",
                "layer:frontend",
                "layer:infra",
              ],
            },
          ],
        },
      ],
    },
  },
];
