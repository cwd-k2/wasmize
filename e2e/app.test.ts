import { test, expect } from "@playwright/test";

test("全5問題が PASS する", async ({ page }) => {
  await page.goto("/");

  // 各問題の status-pass が15個表示されるまで待機
  await expect(page.locator(".status-pass")).toHaveCount(15, { timeout: 10000 });

  // サマリーに All Problems Passed が表示される
  await expect(page.locator(".summary-title")).toContainText("All Problems Passed");
});

test("Realworld Demos セクションが表示される", async ({ page }) => {
  await page.goto("/");

  // セクション見出しが表示される
  await expect(page.locator(".section-heading")).toContainText("Realworld Demos");

  // 4つのデモカードが表示される
  await expect(page.locator(".demo-card")).toHaveCount(4, { timeout: 15000 });

  // 各デモのタイトルが存在する
  await expect(page.locator(".demo-title").nth(0)).toContainText("Grayscale");
  await expect(page.locator(".demo-title").nth(1)).toContainText("Game of Life");
  await expect(page.locator(".demo-title").nth(2)).toContainText("CRC32");
  await expect(page.locator(".demo-title").nth(3)).toContainText("Particle");
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
