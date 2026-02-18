import { test, expect } from "@playwright/test";

test("全5問題が PASS する", async ({ page }) => {
  await page.goto("/");

  // 各問題の status-pass が5つ表示されるまで待機
  await expect(page.locator(".status-pass")).toHaveCount(5, { timeout: 10000 });

  // サマリーに All Problems Passed が表示される
  await expect(page.locator(".summary-title")).toContainText(
    "All Problems Passed",
  );
});
