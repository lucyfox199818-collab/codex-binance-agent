import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5177
  }
});
