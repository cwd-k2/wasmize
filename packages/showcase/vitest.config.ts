import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "examples/**/*.test.ts",
      "bench/**/*.test.ts",
    ],
    exclude: ["e2e/**", "node_modules/**", "**/.claude/**"],
  },
});
