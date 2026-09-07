// @ts-check
const { test, expect, devices } = require('@playwright/test');

const APP_URL = '/apps/flashcards/index.html';
const CONFIG_ROUTE = '**/apps/flashcards/resources/checkride-flashcards-config.json';

// Emulates a real phone (touch input + narrow viewport) for this whole
// file, which is what apps/flashcards/index.html's isPhoneView() checks
// for via matchMedia("(pointer: coarse) and (max-width: 600px)").
test.use({ ...devices['Pixel 5'] });

const TWO_DECK_FIXTURE = [
  { deck: 'Deck A', sections: [
    { name: 'Alpha', items: [['a-front', 'a-back'], ['a2-front', 'a2-back']] },
    { name: 'Bravo', items: [['b-front', 'b-back']] }
  ] },
  { deck: 'Deck B', sections: [
    { name: 'Charlie', items: [['c-front', 'c-back']] }
  ] }
];

test.describe('Phone view (touch input, narrow viewport)', () => {
  test('Manage Sections shows tap move buttons instead of drag handles', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO_DECK_FIXTURE) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();

    await expect(page.locator('.drag-handle')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Move checklist down' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move section down' }).first()).toBeVisible();
  });

  test('tapping a checklist move button reorders checklists', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO_DECK_FIXTURE) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.deck-group-title')).toContainText(['Deck A', 'Deck B']);

    await page.locator('.deck-group', { hasText: 'Deck A' }).getByRole('button', { name: 'Move checklist down' }).click();
    await expect(page.locator('.deck-group-title')).toContainText(['Deck B', 'Deck A']);

    // Boundary buttons are disabled rather than wrapping.
    await expect(page.locator('.deck-group', { hasText: 'Deck B' }).getByRole('button', { name: 'Move checklist up' })).toBeDisabled();
  });

  test('tapping a section move button reorders sections within their checklist', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO_DECK_FIXTURE) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.section-row .name')).toHaveText(['Alpha', 'Bravo', 'Charlie']);

    await page.locator('.section-row', { hasText: 'Alpha' }).getByRole('button', { name: 'Move section down' }).click();
    await expect(page.locator('.section-row .name')).toHaveText(['Bravo', 'Alpha', 'Charlie']);
  });

  test('item rows in the section form show move buttons instead of a drag handle', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO_DECK_FIXTURE) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await page.locator('.section-row', { hasText: 'Alpha' }).getByRole('button', { name: 'Edit' }).click();

    const rows = page.locator('.item-row');
    await expect(rows.first().locator('.drag-handle')).toHaveCount(0);

    await expect(rows.nth(0).locator('input').first()).toHaveValue('a-front');
    await rows.nth(0).getByRole('button', { name: 'Move item down' }).click();
    await expect(rows.nth(0).locator('input').first()).toHaveValue('a2-front');
    await expect(rows.nth(1).locator('input').first()).toHaveValue('a-front');
  });

  test('rotating to a wide/landscape-ish size out of phone range swaps back to drag handles', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO_DECK_FIXTURE) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.drag-handle')).toHaveCount(0);

    await page.setViewportSize({ width: 900, height: 500 });
    await expect(page.locator('.drag-handle').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move checklist down' })).toHaveCount(0);
  });
});
