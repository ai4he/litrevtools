const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting output generation test...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Listen for console messages
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Failed to generate') ||
          text.includes('500') ||
          text.includes('error') ||
          text.includes('Error')) {
        console.log('BROWSER ERROR:', text);
      }
    });

    console.log('Navigating to http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });

    console.log('Filling search form...');
    await page.type('input[name="query"]', 'large language model mathematical reasoning');
    await page.type('input[name="startYear"]', '2023');
    await page.type('input[name="endYear"]', '2023');
    await page.type('input[name="maxResults"]', '5');

    console.log('Starting search...');
    await page.click('button[type="submit"]');

    console.log('Waiting for search to complete...');
    // Wait for completion message
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('completed') || text.includes('Start New Search');
      },
      { timeout: 120000 }
    );

    console.log('Search completed! Waiting for "Generate All Outputs" button...');
    // Wait a bit for UI to update
    await page.waitForTimeout(2000);

    // Find and click the Generate All Outputs button
    const generateButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => btn.textContent.includes('Generate All Outputs'));
    });

    if (generateButton.asElement()) {
      console.log('Clicking "Generate All Outputs"...');
      await generateButton.asElement().click();

      // Wait for download links to appear
      await page.waitForTimeout(5000);

      // Check if outputs were generated successfully
      const hasDownloads = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('CSV') || text.includes('BibTeX') || text.includes('Download');
      });

      if (hasDownloads) {
        console.log('✅ SUCCESS: Outputs generated successfully!');

        // Check what files are available
        const downloads = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          return links
            .filter(a => a.href.includes('/download/'))
            .map(a => a.textContent.trim());
        });

        console.log('Available downloads:', downloads);
      } else {
        console.log('❌ FAILED: No download links found');
      }
    } else {
      console.log('❌ FAILED: Could not find "Generate All Outputs" button');
    }

  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    await browser.close();
  }
})();
