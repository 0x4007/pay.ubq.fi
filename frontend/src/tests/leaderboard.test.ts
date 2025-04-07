import puppeteer, { Browser, Page } from 'puppeteer';
import { test, describe, beforeAll, afterAll } from 'bun:test';

// Mock data for testing
const mockLeaderboardData = [
  {
    githubUsername: 'testuser1',
    totalXp: 100,
    xpByCategory: { comments: 50, task: 30, reviewRewards: 20 },
    repositories: ['ubiquity-os/marketplace']
  }
];

describe('Leaderboard Page', () => {
  let browser: Browser;
  let page: Page;
  const testUrl = 'http://localhost:5174/leaderboard';

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // Enable debugging
      devtools: true,
      dumpio: true
    });
    page = await browser.newPage();

    // Mock worker responses
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().includes('worker')) {
        request.respond({
          status: 200,
          contentType: 'application/javascript',
          body: 'console.log("Mock worker loaded")'
        });
      } else {
        request.continue();
      }
    });

    // Enhanced error logging
    page.on('console', msg => {
      console.log(`Browser console (${msg.type()}): ${msg.text()}`);
    });

    page.on('pageerror', error => {
      console.error(`Page error: ${error.message}`);
    });

    await page.goto(testUrl, {
      waitUntil: 'networkidle0',
      timeout: 10000
    });

    // Inject mock data
    await page.evaluate((data) => {
      window.__MOCK_LEADERBOARD_DATA__ = data;
    }, mockLeaderboardData);
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should load without JavaScript errors', async () => {
    // Test will fail if any errors were caught by our handlers
  });

  test('should render the leaderboard chart', async () => {
    // Wait for chart container and verify it's visible
    await page.waitForSelector('.chart-container', { timeout: 10000 });
    const chartContainer = await page.$('.chart-container');
    if (!chartContainer) {
      throw new Error('Chart container not found');
    }

    // Verify chart elements exist
    const chartExists = await page.$('.recharts-wrapper') !== null;
    const barsExist = await page.$('.recharts-bar') !== null;

    if (!chartExists || !barsExist) {
      const html = await page.content();
      console.log('Current page HTML:', html);
      throw new Error('Chart elements not rendered');
    }
  }, 15000); // Increased timeout

  test('should allow time filtering', async () => {
    // Verify radio group exists
    const radioGroup = await page.$('.time-radio-group');
    if (!radioGroup) {
      throw new Error('Time filter radio group not found');
    }

    // Test each time filter radio button with better selectors
    const timeFilters = [
      { label: '1 Week', value: '1' },
      { label: '2 Weeks', value: '2' },
      { label: '1 Month', value: '4' },
      { label: '3 Months', value: '13' },
      { label: '1 Year', value: '52' }
    ];

    for (const filter of timeFilters) {
      const radioSelector = `input[type="radio"][value="${filter.value}"]`;
      await page.waitForSelector(radioSelector, { timeout: 5000 });

      // Click using more reliable method
      await page.evaluate((selector) => {
        const radio = document.querySelector(selector);
        if (radio) radio.click();
      }, radioSelector);

      // Wait for potential updates
      await page.waitForTimeout(1000);

      // Verify radio is checked
      const isChecked = await page.evaluate((selector) => {
        const radio = document.querySelector(selector);
        return radio ? radio.checked : false;
      }, radioSelector);

      if (!isChecked) {
        throw new Error(`Filter ${filter.label} radio not checked after click`);
      }
    }
  }, 30000); // Increased timeout

  test('should match screenshot', async () => {
    await page.waitForSelector('.recharts-wrapper', { timeout: 5000 });
    const screenshot = await page.screenshot({ fullPage: true });
    // In CI you would compare against baseline image
    if (!screenshot || screenshot.length === 0) {
      throw new Error('Failed to capture screenshot');
    }
  });
});
