import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Vitest configuration for the composed control-plane API specification. */
export default defineConfig({ plugins: [tsconfigPaths({ projects: ["../../../../../tsconfig.vitest.json"] })], test: { passWithNoTests: true } });
