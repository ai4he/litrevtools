const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Collect console logs with filtering
  page.on('console', msg => {
    const text = msg.text();
    // Only show our debug logs and errors
    if (text.includes('[useProgress]') ||
        text.includes('[SearchPage]') ||
        text.includes('Socket connected') ||
        text.includes('Received progress') ||
        text.includes('Received paper') ||
        msg.type() === 'error') {
      console.log('BROWSER LOG:', msg.type(), text);
    }
  });

  // Collect errors
  page.on('pageerror', error => {
    console.error('BROWSER ERROR:', error.message);
  });

  try {
    console.log('Navigating to http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle0', timeout: 30000 });

    console.log('Taking screenshot 1: Initial load...');
    await page.screenshot({ path: '/tmp/ui-test-1-initial.png', fullPage: true });

    // Check if we're on login page
    const guestButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => btn.textContent.includes('Continue as Guest'));
    });

    if (guestButton && guestButton.asElement()) {
      console.log('Found guest button, clicking...');
      await guestButton.asElement().click();
      await page.waitForTimeout(2000);

      console.log('Taking screenshot 2: After guest login...');
      await page.screenshot({ path: '/tmp/ui-test-2-after-login.png', fullPage: true });
    } else {
      console.log('Guest button not found, might already be logged in');
    }

    // Check if search form is visible
    const searchForm = await page.$('form');
    if (searchForm) {
      console.log('Search form found!');

      // Fill in search parameters
      console.log('Adding inclusion keyword...');

      // Click the "machine learning" suggestion button
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const mlButton = buttons.find(btn => btn.textContent.includes('large language model'));
        if (mlButton) {
          mlButton.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        console.log('Clicked "large language model" suggestion');
      } else {
        console.log('Suggestion not found, typing manually...');
        const inputs = await page.$$('input');
        if (inputs.length > 0) {
          await inputs[0].type('machine learning');
          await page.keyboard.press('Enter');
        }
      }

      await page.waitForTimeout(1000);

      // Fill max results and year using evaluate
      console.log('Setting max results and year...');
      await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        // Find max results input
        const maxInput = inputs.find(inp => inp.placeholder && inp.placeholder.includes('unlimited'));
        if (maxInput) {
          maxInput.value = '3';
        }
        // Find end year input
        const yearInput = inputs.find(inp => inp.placeholder && inp.placeholder.includes('2024'));
        if (yearInput) {
          yearInput.value = '2024';
        }
      });

      console.log('Taking screenshot 3: Form filled...');
      await page.screenshot({ path: '/tmp/ui-test-3-form-filled.png', fullPage: true });

      // Submit form
      console.log('Submitting search form...');
      const submitted = await page.evaluate(() => {
        const submitButton = document.querySelector('button[type="submit"]');
        if (submitButton && !submitButton.disabled) {
          submitButton.click();
          return true;
        }
        return false;
      });

      if (submitted) {
        console.log('Form submitted! Waiting for results...');

        // Wait for progress to appear
        await page.waitForTimeout(5000);

        console.log('Taking screenshot 4: After submit...');
        await page.screenshot({ path: '/tmp/ui-test-4-after-submit.png', fullPage: true });

        // Check page content
        const bodyHTML = await page.evaluate(() => document.body.innerHTML);
        console.log('Body contains "LitRevTools":', bodyHTML.includes('LitRevTools'));
        console.log('Body contains "Progress":', bodyHTML.includes('Progress') || bodyHTML.includes('progress'));
        console.log('Body contains "Search":', bodyHTML.includes('Search'));

        // Get React component state info
        const debugInfo = await page.evaluate(() => {
          return {
            hasForm: !!document.querySelector('form'),
            hasProgress: !!document.querySelector('[class*="progress"]'),
            hasPapers: !!document.querySelector('[class*="paper"]'),
            bodyClasses: document.body.className,
            allHeadings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent)
          };
        });
        console.log('Debug info:', JSON.stringify(debugInfo, null, 2));

        // Wait longer for search to complete
        console.log('Waiting for search to complete...');
        await page.waitForTimeout(15000);

        console.log('Taking screenshot 5: Final state...');
        await page.screenshot({ path: '/tmp/ui-test-5-final.png', fullPage: true });

        // Get all text content
        const allText = await page.evaluate(() => document.body.innerText);
        console.log('\n=== PAGE TEXT CONTENT ===');
        console.log(allText);
        console.log('=== END PAGE TEXT ===\n');
      } else {
        console.log('Could not submit form - button not found or disabled');
      }
    } else {
      console.log('Search form not found!');
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Page text:', bodyText);
    }

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: '/tmp/ui-test-error.png', fullPage: true });
  } finally {
    console.log('\nScreenshots saved to /tmp/ui-test-*.png');
    await browser.close();
  }
})();
