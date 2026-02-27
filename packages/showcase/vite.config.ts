import { defineConfig } from "vite";
// @ts-expect-error -- node:url has no type declarations in this project
import { fileURLToPath, URL } from "node:url";

const html = (name: string) =>
  fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist-app",
    rollupOptions: {
      input: {
        main: html("index"),
        problems: html("problems"),
        demos: html("demos"),
        game: html("game"),
      },
    },
  },
});
