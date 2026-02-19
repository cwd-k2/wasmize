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
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "bench/**/*.test.ts", "examples/**/__tests__/**/*.test.ts"],
  },
});
