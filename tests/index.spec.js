// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('App hub (index.html)', () => {
  test('renders the header and a tile for each app', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('HTML Apps');
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.tile .tile-title')).toHaveText('Checkride Flashcards');
  });

  test('flashcards tile links to a real, loadable file (not a bare directory path)', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('.tile').first().getAttribute('href');
    // Regression guard: a directory-style href (e.g. "./apps/flashcards/")
    // only resolves via a server's index-file fallback and 404s when the
    // page is opened directly from disk (file://). It must point at the
    // actual file.
    expect(href).toMatch(/index\.html$/);
  });

  test('clicking the flashcards tile navigates to the flashcards app', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tile', { hasText: 'Checkride Flashcards' }).click();
    await expect(page).toHaveURL(/\/apps\/flashcards\/index\.html$/);
    await expect(page.locator('h1')).toContainText('Checkride Flashcards');
  });
});
