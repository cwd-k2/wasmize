/// <reference types="vitest/config" />
import { defineConfig } from "vite";
// @ts-expect-error -- node:url has no type declarations in this project
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-app",
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "showcase/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**"],
    },
  },
});
