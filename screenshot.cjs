const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiLliJjoiKrnjq4iLCJpYXQiOjE3ODM1ODE5NTMsImV4cCI6MTc4NDE4Njc1M30.kg3eRYl4AqaLJoL-HxvtP2INrhHK3Uguk-jCyJA-zdA';

    const context = await browser.newContext();
    await context.addInitScript((t) => { localStorage.setItem('token_key', t); }, TOKEN);

    const page = await context.newPage();
    await page.setViewportSize({ width: 1500, height: 900 });

    page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('400') && !msg.text().includes('404') && !msg.text().includes('401'))
            console.log('[ERR]', msg.text().slice(0, 250));
    });
    page.on('pageerror', err => console.log('[PAGE]', err.message.slice(0, 300)));

    await page.goto('http://localhost:5174/#/migration-test-render', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    let text = await page.evaluate(() => document.body.innerText.slice(0, 500));
    if (text.includes('登 录') || text.includes('登录')) {
        await page.evaluate(() => { window.location.hash = '#/migration-test-render'; });
        await page.waitForTimeout(5000);
    }
    text = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log('Page:', text.slice(0, 300));

    // Click the test button (second button = "开始测试")
    const btns = await page.$$('button');
    for (const b of btns) {
        const label = await b.textContent();
        if (label.includes('开始测试')) {
            await b.click();
            await page.waitForTimeout(4000);
            break;
        }
    }

    text = await page.evaluate(() => document.body.innerText.slice(0, 5000));
    console.log('\n=== 结果（renderMarkdown 已移除） ===');
    console.log(text);

    // Switch to original and re-test
    const toggleBtns = await page.$$('button');
    for (const b of toggleBtns) {
        const label = await b.textContent();
        if (label.includes('切换')) {
            await b.click();
            await page.waitForTimeout(1000);
            break;
        }
    }
    // Click test again
    for (const b of await page.$$('button')) {
        const label = await b.textContent();
        if (label.includes('开始测试')) {
            await b.click();
            await page.waitForTimeout(4000);
            break;
        }
    }
    text = await page.evaluate(() => document.body.innerText.slice(0, 5000));
    console.log('\n=== 结果（renderMarkdown 原始实现） ===');
    console.log(text);

    await page.screenshot({ path: 'migration-test-6-result.png', fullPage: true });
    console.log('\n截图已保存');
    await browser.close();
})();
