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
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        game: fileURLToPath(new URL("./game.html", import.meta.url)),
      },
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "showcase/**/*.test.ts"],
    exclude: ["showcase/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**"],
    },
  },
});
