import { test, expect } from "@playwright/test";

test("全16問題が PASS する", async ({ page }) => {
  await page.goto("/");

  // 各問題の status-pass が16個表示されるまで待機
  await expect(page.locator(".status-pass")).toHaveCount(16, { timeout: 10000 });

  // サマリーに All Problems Passed が表示される
  await expect(page.locator(".summary-title")).toContainText("All Problems Passed");
});

test("Realworld Demos セクションが表示される", async ({ page }) => {
  await page.goto("/");

  // セクション見出しが表示される
  await expect(page.locator(".section-heading")).toContainText("Realworld Demos");

  // 10個のデモカードが表示される
  await expect(page.locator(".demo-card")).toHaveCount(10, { timeout: 15000 });

  // 各デモのタイトルが存在する
  await expect(page.locator(".demo-title").nth(0)).toContainText("Grayscale");
  await expect(page.locator(".demo-title").nth(1)).toContainText("Sepia");
  await expect(page.locator(".demo-title").nth(2)).toContainText("Histogram Equalization");
  await expect(page.locator(".demo-title").nth(3)).toContainText("Convolution");
  await expect(page.locator(".demo-title").nth(4)).toContainText("Game of Life");
  await expect(page.locator(".demo-title").nth(5)).toContainText("CRC32");
  await expect(page.locator(".demo-title").nth(6)).toContainText("Morphology");
  await expect(page.locator(".demo-title").nth(7)).toContainText("Histogram");
  await expect(page.locator(".demo-title").nth(8)).toContainText("Maze");
  await expect(page.locator(".demo-title").nth(9)).toContainText("Particle");
});

test("CRC32 デモがリアルタイム計算する", async ({ page }) => {
  await page.goto("/");

  // CRC32 デモの入力フィールドを待機
  const input = page.locator('[data-id="crc-input"]');
  await expect(input).toBeVisible({ timeout: 15000 });

  // デフォルト値 "123456789" の CRC32 結果
  await expect(page.locator('[data-id="crc-result"]')).toContainText("CBF43926");

  // テキストを変更して結果が更新される
  await input.fill("test");
  await expect(page.locator('[data-id="crc-result"]')).toContainText("D87F7E0C");
});
