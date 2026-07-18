import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Vitest configuration for tenant hosting adapters. */
export default defineConfig({ plugins: [tsconfigPaths({ projects: ["../../../../tsconfig.vitest.json"] })], test: { passWithNoTests: true } });
