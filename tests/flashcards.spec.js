// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_URL = '/apps/flashcards/index.html';
const CONFIG_ROUTE = '**/apps/flashcards/resources/checkride-flashcards-config.json';

// A small, fixed 3-section deck used by the ordering tests below so they
// don't depend on (or get broken by) edits made to the real resources file.
const ORDERED_DECK = [
  { deck: 'Deck A', sections: [
    { name: 'Alpha', items: [['a-front', 'a-back']] },
    { name: 'Bravo', items: [['b-front', 'b-back']] },
    { name: 'Charlie', items: [['c-front', 'c-back']] }
  ] }
];

const TWO_DECKS = [
  { deck: 'Deck One', sections: [{ name: 'S1', items: [['f1', 'b1']] }] },
  { deck: 'Deck Two', sections: [{ name: 'S2', items: [['f2', 'b2']] }] }
];

const ITEM_ORDER_DECK = [
  { deck: 'Deck Items', sections: [
    { name: 'Multi', items: [['front-1', 'back-1'], ['front-2', 'back-2'], ['front-3', 'back-3']] }
  ] }
];

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

  test('on a fresh browser (no local edits), it fetches resources/checkride-flashcards-config.json and renders that data', async ({ page }) => {
    const customDeck = [
      { deck: 'Test Deck — Only One', sections: [
        { name: 'Only Section', items: [['Test Challenge', 'Test Response']] }
      ] }
    ];

    let requested = false;
    await page.route('**/apps/flashcards/resources/checkride-flashcards-config.json', (route) => {
      requested = true;
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(customDeck) });
    });

    await page.goto(APP_URL);
    await expect(page.locator('#headerStat')).toHaveText('1 checklists · 1 sections · 1 items');
    expect(requested).toBe(true);
  });

  test('shows a retry-able error if the resources file is unavailable (e.g. opened via file://)', async ({ page }) => {
    await page.route('**/apps/flashcards/resources/checkride-flashcards-config.json', (route) => {
      route.fulfill({ status: 404, body: 'not found' });
    });

    await page.goto(APP_URL);
    await expect(page.getByText("Couldn't Load Checklists")).toBeVisible();
    await expect(page.getByText('Quiz Me On Everything')).toHaveCount(0);

    // Once the file becomes reachable, Retry should recover into the normal home view.
    await page.unroute('**/apps/flashcards/resources/checkride-flashcards-config.json');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('.mode-card')).toHaveCount(3);
    await expect(page.locator('#headerStat')).toHaveText(/22 checklists/);
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

  // These tests pick whichever section happens to be first in the config
  // file rather than a hardcoded name — that file is meant to be edited
  // (see resources/checkride-flashcards-config.json), so tests shouldn't
  // assume specific section names survive.
  test('Drill One Section quizzes only the items in the chosen section', async ({ page }) => {
    await page.goto(APP_URL);
    const drillCard = page.locator('.mode-card', { hasText: 'Drill One Section' });
    const firstOption = drillCard.locator('select option').first();
    const sectionName = await firstOption.textContent();
    await drillCard.locator('select').selectOption({ index: 0 });
    await drillCard.getByRole('button', { name: 'Start Drill' }).click();

    await expect(page.locator('.eyebrow')).toContainText(sectionName);
    await expect(page.locator('.progress')).toContainText('Card 1 of');
  });

  test('Drill One Section: Next/Prev Section arrows move between sections without returning to Home', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    await page.goto(APP_URL);
    const drillCard = page.locator('.mode-card', { hasText: 'Drill One Section' });
    await drillCard.locator('select').selectOption({ label: 'Alpha' });
    await drillCard.getByRole('button', { name: 'Start Drill' }).click();
    await expect(page.locator('.eyebrow')).toContainText('Alpha');

    await page.getByRole('button', { name: 'Next Section ›' }).click();
    await expect(page.locator('.eyebrow')).toContainText('Bravo');
    await expect(page.locator('.progress')).toContainText('Card 1 of');

    await page.getByRole('button', { name: '‹ Prev Section' }).click();
    await expect(page.locator('.eyebrow')).toContainText('Alpha');

    // Wraps around at the ends, for continuous iteration.
    await page.getByRole('button', { name: '‹ Prev Section' }).click();
    await expect(page.locator('.eyebrow')).toContainText('Charlie');
  });

  test('Drill One Section: the section dropdown jumps directly to another section', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    await page.goto(APP_URL);
    const drillCard = page.locator('.mode-card', { hasText: 'Drill One Section' });
    await drillCard.locator('select').selectOption({ label: 'Alpha' });
    await drillCard.getByRole('button', { name: 'Start Drill' }).click();

    await page.locator('.section-nav select').selectOption({ label: 'Charlie' });
    await expect(page.locator('.eyebrow')).toContainText('Charlie');
  });

  test('Review A Whole Section: Next/Prev Section arrows and dropdown switch sections in place', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    await page.goto(APP_URL);
    const reviewCard = page.locator('.mode-card', { hasText: 'Review A Whole Section' });
    await reviewCard.locator('select').selectOption({ label: 'Alpha' });
    await reviewCard.getByRole('button', { name: 'Open Review Card' }).click();
    await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();

    await page.getByRole('button', { name: 'Next Section ›' }).click();
    await expect(page.getByRole('heading', { name: 'Bravo' })).toBeVisible();

    await page.locator('.section-nav select').selectOption({ label: 'Charlie' });
    await expect(page.getByRole('heading', { name: 'Charlie' })).toBeVisible();
  });

  test('Quiz Me On Everything (mode "all") has no per-section nav, since it spans every section', async ({ page }) => {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: 'Start Random Quiz' }).click();
    await expect(page.locator('.section-nav')).toHaveCount(0);
  });

  test('Review A Whole Section reveals and hides all responses at once', async ({ page }) => {
    await page.goto(APP_URL);
    const reviewCard = page.locator('.mode-card', { hasText: 'Review A Whole Section' });
    await reviewCard.locator('select').selectOption({ index: 0 });
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

  test('Reset to Original Checklists re-fetches the resources file', async ({ page }) => {
    await page.goto(APP_URL);

    let fetchCount = 0;
    await page.route('**/apps/flashcards/resources/checkride-flashcards-config.json', (route) => {
      fetchCount++;
      route.continue();
    });

    await page.getByRole('button', { name: /Manage Sections/ }).click();
    const resetBtn = page.getByRole('button', { name: 'Reset to Original Checklists' });
    await resetBtn.click();
    await page.getByRole('button', { name: 'Click again to confirm reset' }).click();

    await expect(page.locator('.section-row').first()).toBeVisible();
    expect(fetchCount).toBe(1);
  });

  test('editing a section keeps its position in the list', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();

    await expect(page.locator('.section-row .name')).toHaveText(['Alpha', 'Bravo', 'Charlie']);

    // Edit the middle section (Bravo) and change its content.
    await page.locator('.section-row', { hasText: 'Bravo' }).getByRole('button', { name: 'Edit' }).click();
    const taglineInput = page.locator('.field', { hasText: 'Mnemonic' }).locator('input');
    await taglineInput.fill('Edited Tagline');
    await page.getByRole('button', { name: 'Save Section' }).click();

    // Still Alpha, Bravo, Charlie in that order — Bravo didn't move to the end.
    await expect(page.locator('.section-row .name')).toHaveText([
      'Alpha',
      'Bravo — “Edited Tagline”',
      'Charlie',
    ]);
  });

  test('dragging a section handle reorders sections within the same checklist', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.section-row .name')).toHaveText(['Alpha', 'Bravo', 'Charlie']);

    // Drag Charlie's handle onto Alpha's row to move it to the front.
    const charlieHandle = page.locator('.section-row', { hasText: 'Charlie' }).locator('.drag-handle');
    const alphaRow = page.locator('.section-row', { hasText: 'Alpha' });
    await charlieHandle.dragTo(alphaRow);

    await expect(page.locator('.section-row .name')).toHaveText(['Charlie', 'Alpha', 'Bravo']);
  });

  test('dragging a checklist handle reorders checklists', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO_DECKS) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.deck-group-title')).toContainText(['Deck One', 'Deck Two']);

    const deckTwoHandle = page.locator('.deck-group', { hasText: 'Deck Two' }).locator('.deck-group-title .drag-handle');
    const deckOneGroup = page.locator('.deck-group', { hasText: 'Deck One' });
    await deckTwoHandle.dragTo(deckOneGroup);

    await expect(page.locator('.deck-group-title')).toContainText(['Deck Two', 'Deck One']);
  });

  test('dragging an item handle reorders items within the section form', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ITEM_ORDER_DECK) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await page.locator('.section-row', { hasText: 'Multi' }).getByRole('button', { name: 'Edit' }).click();

    const rows = page.locator('.item-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('input').first()).toHaveValue('front-1');

    // Drag the 3rd row's handle to just above the 1st row, moving it to the front.
    await rows.nth(2).locator('.drag-handle').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });

    await expect(rows.nth(0).locator('input').first()).toHaveValue('front-3');
    await expect(rows.nth(1).locator('input').first()).toHaveValue('front-1');
    await expect(rows.nth(2).locator('input').first()).toHaveValue('front-2');

    // Saving persists the new DOM order.
    await page.getByRole('button', { name: 'Save Section' }).click();
    await page.locator('.section-row', { hasText: 'Multi' }).getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('.item-row').nth(0).locator('input').first()).toHaveValue('front-3');
  });

  test('Export Config prompts for a save location via the File System Access API when available', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    // Stub the native picker — a real one can't be driven in automation —
    // so we can assert the app actually calls it and writes to the handle
    // it gets back, without a real OS dialog ever appearing.
    await page.addInitScript(() => {
      window.__savePicker = { calls: [], written: null };
      window.showSaveFilePicker = async (options) => {
        window.__savePicker.calls.push(options);
        return {
          createWritable: async () => ({
            write: async (data) => { window.__savePicker.written = data; },
            close: async () => {},
          }),
        };
      };
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await page.getByRole('button', { name: 'Export Config' }).click();

    const picker = await page.evaluate(() => window.__savePicker);
    expect(picker.calls).toHaveLength(1);
    expect(picker.calls[0].suggestedName).toBe('checkride-flashcards-config.json');

    const exported = JSON.parse(picker.written);
    expect(exported.map((d) => d.deck)).toEqual(['Deck A']);
    expect(exported[0].sections.map((s) => s.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('Export Config does not fall back to a silent download if the save prompt is cancelled', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    await page.addInitScript(() => {
      window.showSaveFilePicker = async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      };
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();

    let downloadFired = false;
    page.on('download', () => { downloadFired = true; });
    await page.getByRole('button', { name: 'Export Config' }).click();
    await page.waitForTimeout(300);
    expect(downloadFired).toBe(false);
  });

  test('Export Config falls back to a plain download when the File System Access API is unavailable', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    // Simulate a browser without the File System Access API (e.g. Firefox/Safari).
    await page.addInitScript(() => { delete window.showSaveFilePicker; });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Config' }).click(),
    ]);
    const filePath = await download.path();
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    expect(exported.map((d) => d.deck)).toEqual(['Deck A']);
    expect(exported[0].sections.map((s) => s.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('Import Config replaces sections and preserves the imported order exactly', async ({ page }) => {
    await page.route(CONFIG_ROUTE, (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ORDERED_DECK) });
    });
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.section-row .name')).toHaveText(['Alpha', 'Bravo', 'Charlie']);

    // Import a file with a deliberately different order and an extra deck.
    const customOrder = [
      { deck: 'Deck Z', sections: [
        { name: 'Zulu', items: [['z-front', 'z-back']] }
      ] },
      { deck: 'Deck A', sections: [
        { name: 'Charlie', items: [['c-front', 'c-back']] },
        { name: 'Alpha', items: [['a-front', 'a-back']] },
        { name: 'Bravo', items: [['b-front', 'b-back']] }
      ] }
    ];
    const tmpFile = path.join(os.tmpdir(), `checkride-import-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(customOrder));

    await page.locator('input[type="file"]').setInputFiles(tmpFile);
    await page.getByRole('button', { name: 'Replace My Sections' }).click();

    await expect(page.locator('.deck-group-title')).toContainText(['Deck Z', 'Deck A']);
    await expect(page.locator('.section-row .name')).toHaveText(['Zulu', 'Charlie', 'Alpha', 'Bravo']);

    fs.unlinkSync(tmpFile);
  });

  test('Manage Sections view lists sections with edit/delete controls', async ({ page }) => {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Manage Sections/ }).click();
    await expect(page.locator('.eyebrow')).toHaveText('Manage Sections');
    await expect(page.locator('.section-row').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Section' })).toBeVisible();
  });
});
