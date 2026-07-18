import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const require = createRequire(import.meta.url);

/** Vitest configuration for the frozen-blue OpenClaw tenant feature. */
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["../../../../tsconfig.vitest.json"] })],
  resolve: { alias: { "@opentelemetry/api": require.resolve("@opentelemetry/api") } },
  test: { passWithNoTests: true },
});
