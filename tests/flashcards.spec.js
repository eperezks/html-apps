// @ts-check
const { test, expect } = require('@playwright/test');

const APP_URL = '/apps/flashcards/index.html';

test.describe('Checkride Flashcards app', () => {
  test('loads directly and shows the three study modes', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator('h1')).toContainText('Checkride Flashcards');
    await expect(page.locator('.mode-card')).toHaveCount(3);
    await expect(page.getByText('Quiz Me On Everything')).toBeVisible();
    await expect(page.getByText('Drill One Section')).toBeVisible();
    await expect(page.getByText('Review A Whole Section')).toBeVisible();
  });

  test('header stat reflects the loaded deck/section/item counts', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator('#headerStat')).toHaveText(/\d+ checklists · \d+ sections · \d+ items/);
  });

  test('Quiz Me On Everything starts a flippable quiz session', async ({ page }) => {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: 'Start Random Quiz' }).click();

    await expect(page.locator('.flip-card')).toBeVisible();
    await expect(page.locator('.face.front .txt')).not.toBeEmpty();

    // The back-of-card answer should not be visible until flipped.
    await expect(page.locator('.flip-card')).not.toHaveClass(/flipped/);
    await page.getByRole('button', { name: 'Flip' }).click();
    await expect(page.locator('.flip-card')).toHaveClass(/flipped/);
    await expect(page.locator('.face.back .txt')).not.toBeEmpty();
  });

  test('Drill One Section quizzes only the items in the chosen section', async ({ page }) => {
    await page.goto(APP_URL);
    const drillCard = page.locator('.mode-card', { hasText: 'Drill One Section' });
    await drillCard.locator('select').selectOption({ label: 'Cabin' });
    await drillCard.getByRole('button', { name: 'Start Drill' }).click();

    await expect(page.locator('.eyebrow')).toContainText('Cabin');
    await expect(page.locator('.progress')).toContainText('Card 1 of');
  });

  test('Review A Whole Section reveals and hides all responses at once', async ({ page }) => {
    await page.goto(APP_URL);
    const reviewCard = page.locator('.mode-card', { hasText: 'Review A Whole Section' });
    await reviewCard.locator('select').selectOption({ label: 'Cabin' });
    await reviewCard.getByRole('button', { name: 'Open Review Card' }).click();

    const responses = page.locator('.row-resp');
    await expect(responses.first()).toHaveText('');

    await page.getByRole('button', { name: 'Reveal Responses' }).click();
    await expect(responses.first()).not.toHaveText('');
    await expect(page.getByRole('button', { name: 'Hide Responses' })).toBeVisible();

    await page.getByRole('button', { name: 'Hide Responses' }).click();
    await expect(responses.first()).toHaveText('');
  });

  test('Back navigation returns from a quiz session to Home', async ({ page }) => {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: 'Start Random Quiz' }).click();
    await page.getByRole('button', { name: '‹ Back' }).click();
    await expect(page.getByText('Quiz Me On Everything')).toBeVisible();
  });

  test('Manage Sections view lists sections with edit/delete controls', async ({ page }) => {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.eyebrow')).toHaveText('Manage Sections');
    await expect(page.locator('.section-row').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Section' })).toBeVisible();
  });
});
