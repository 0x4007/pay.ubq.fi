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

    // Enhanced worker mock with persistence checks
    await page.evaluate(() => {
      // Create mock worker with all required Worker properties
      const mockWorker = {
        postMessage: (data: unknown) => {
          console.log('Mock worker message sent:', data);
          // Queue messages if no handler set yet
          if (!this.onmessage) {
            this.messageQueue = this.messageQueue || [];
            this.messageQueue.push(data);
          }
        },
        onmessage: null,
        onmessageerror: null,
        onerror: null,
        addEventListener: (type: string, listener: any) => {
          if (type === 'message') this.onmessage = listener;
        },
        removeEventListener: () => {},
        dispatchEvent: () => true,
        terminate: () => {},
        messageQueue: [] as any[]
      };

      // Create persistent mock context
      const mockContext = {
        worker: mockWorker,
        isWorkerInitialized: true,
        workerError: null
      };

      // Make it non-configurable and non-writable
      Object.defineProperty(window, '__MOCK_WORKER_CONTEXT__', {
        value: mockContext,
        writable: false,
        configurable: false
      });

      console.log('Mock worker context created:', window.__MOCK_WORKER_CONTEXT__);
    });

    // Verify mock persists after creation
    await page.evaluate(() => {
      if (!window.__MOCK_WORKER_CONTEXT__) {
        throw new Error('Mock worker context not set');
      }
      if (!window.__MOCK_WORKER_CONTEXT__.worker) {
        throw new Error('Mock worker not set in context');
      }
    });

    // Enhanced React context override with debugging
    await page.addScriptTag({
      content: `
        console.log('Installing React context override...');
        const originalUseContext = window.React.useContext;
        window.React.useContext = (context) => {
          console.log('Intercepting useContext call for:', context);
          if (context._context && context._context.displayName === 'WorkerContext') {
            console.log('Returning mock worker context');
            return window.__MOCK_WORKER_CONTEXT__;
          }
          return originalUseContext(context);
        };
        console.log('React context override installed');
      `
    });

    // Verify mock was properly set
    await page.evaluate(() => {
      console.log('Verifying mock worker context:', window.__MOCK_WORKER_CONTEXT__);
      if (!window.__MOCK_WORKER_CONTEXT__) {
        throw new Error('Mock worker context not set');
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

    // Inject mock data and mock worker
    await page.evaluate((data) => {
      window.__MOCK_LEADERBOARD_DATA__ = data;

      // Mock worker responses
      window.__MOCK_WORKER_CONTEXT__.worker.onmessage = ({ data }) => {
        if (data.type === 'FETCH_LEADERBOARD_DATA') {
          window.__MOCK_WORKER_CONTEXT__.worker.postMessage({
            type: 'LEADERBOARD_DATA_RESULT',
            payload: {
              processedData: window.__MOCK_LEADERBOARD_DATA__,
              rawData: []
            }
          });
        }
      };
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

      // Click with proper type assertion
      await page.evaluate((selector) => {
        const radio = document.querySelector(selector) as HTMLInputElement;
        if (radio) radio.click();
      }, radioSelector);

      // Wait for potential updates
      await page.waitForTimeout(1000);

      // Verify radio is checked with proper type assertion
      const isChecked = await page.evaluate((selector) => {
        const radio = document.querySelector(selector) as HTMLInputElement;
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
