import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  envPrefix: ["VITE_", "DISABLE_BACKEND_PREFIX", "IMAGE_URL_PREFIX"],
  define: {
    "process.env": {},
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 30,
        branches: 20,
        functions: 25,
        statements: 30,
      },
    },
  },
});
