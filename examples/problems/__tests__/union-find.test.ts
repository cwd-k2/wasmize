import { describe, test, expect } from "vitest";
import { problem15_union_find } from "../union-find";
import { instantiate } from "@/test-helpers";

describe("Union-Find", () => {
  test("basic union and find", async () => {
    const { exports: { uf_init, uf_union, uf_find, uf_count } } =
      await instantiate(problem15_union_find());

    uf_init(5);
    expect(uf_count()).toBe(5);

    uf_union(0, 1);
    expect(uf_count()).toBe(4);
    expect(uf_find(0)).toBe(uf_find(1));

    uf_union(2, 3);
    expect(uf_count()).toBe(3);

    uf_union(0, 2);
    expect(uf_count()).toBe(2);
    expect(uf_find(0)).toBe(uf_find(3));
  });

  test("all in one set", async () => {
    const { exports: { uf_init, uf_union, uf_count } } =
      await instantiate(problem15_union_find());

    uf_init(10);
    for (let i = 0; i < 9; i++) uf_union(i, i + 1);
    expect(uf_count()).toBe(1);
  });

  test("duplicate union is idempotent", async () => {
    const { exports: { uf_init, uf_union, uf_count } } =
      await instantiate(problem15_union_find());

    uf_init(3);
    uf_union(0, 1);
    uf_union(0, 1); // duplicate
    expect(uf_count()).toBe(2); // should still be 2
  });
});
