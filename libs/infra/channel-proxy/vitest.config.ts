import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Vitest configuration for the identity-routing channel proxy. */
export default defineConfig({ plugins: [tsconfigPaths({ projects: ["../../../tsconfig.vitest.json"] })], test: { passWithNoTests: true } });
