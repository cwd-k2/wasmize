import { bench, describe } from "vitest";
import { minheapDijkstra } from "../../examples/advanced/minheap-dijkstra";
import { jsDijkstra } from "../js-impls";

const W = 32;
const H = 32;
const weights = Array.from({ length: W * H }, () => Math.floor(Math.random() * 10) + 1);

const { setWeights, dijkstra } = await minheapDijkstra();
setWeights(weights);

describe(`dijkstra ${W}×${H} grid`, () => {
  bench("JS", () => {
    jsDijkstra(weights, W, H, 0, 0, W - 1, H - 1);
  });

  bench("Wasm", () => {
    dijkstra(W, H, 0, 0, W - 1, H - 1);
  });
});
