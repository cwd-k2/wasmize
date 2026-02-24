import { defineConfig } from "vite";
// @ts-expect-error -- node:url has no type declarations in this project
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  build: {
    outDir: "dist-app",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        game: fileURLToPath(new URL("./game.html", import.meta.url)),
      },
    },
  },
});
