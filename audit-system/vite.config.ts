import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5177
  },
  test: {
    testTimeout: 30_000
  }
});
