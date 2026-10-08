import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const base = new URL('../src/', import.meta.url);
test('interface: proposta, validação, desenho, undo/redo, cancelamento e ficheiros', async () => {
  const server = createServer(async (request, response) => {
    const name = request.url === '/' ? 'index.html' : request.url.slice(1);
    if (!['index.html', 'renderer.js', 'core.js', 'style.css', 'assistant.js', 'learning.js', 'intent-model.js'].includes(name)) { response.writeHead(404); response.end(); return; }
    try { response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await readFile(new URL(name, base))); }
    catch { response.writeHead(500); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      let savedProject;
      window.magiccad = { save: async project => { savedProject = structuredClone(project); return 'teste.magiccad.json'; }, open: async () => ({ name: 'teste.magiccad.json', project: structuredClone(savedProject) }) };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#example').click();
    assert.equal(await page.locator('#room-dialog').evaluate(e => e.open), true);
    assert.equal(await page.locator('#entities > g').count(), 0);
    await page.locator('#room-width').fill('4.0001'); await page.getByRole('button', { name: 'Aplicar à planta' }).click();
    assert.match(await page.locator('#room-error').innerText(), /não foi arredondada/);
    assert.equal(await page.locator('#entities > g').count(), 0);
    await page.locator('#room-width').fill('4'); await page.getByRole('button', { name: 'Aplicar à planta' }).click();
    assert.equal(await page.locator('#entities > g').count(), 1);
    assert.match(await page.locator('.room-area').textContent(), /20 m²/);
    await page.locator('#undo').click(); assert.equal(await page.locator('#entities > g').count(), 0);
    await page.locator('#redo').click(); assert.equal(await page.locator('#entities > g').count(), 1);
    await page.locator('#example').click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#entities > g').count(), 1);
    await page.locator('#line').click();
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.click(box.x + box.width * .3, box.y + box.height * .3); await page.mouse.click(box.x + box.width * .6, box.y + box.height * .6);
    assert.equal(await page.locator('.cad-line').count(), 1, await page.locator('#status').textContent() + ' / ' + await page.locator('#mode').textContent() + ' / ' + JSON.stringify(errors));
    await page.locator('#save').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('guardado'));
    await page.locator('#undo').click(); assert.equal(await page.locator('.cad-line').count(), 0);
    page.on('dialog', dialog => dialog.accept()); await page.locator('#open').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('aberto'));
    assert.equal(await page.locator('.cad-line').count(), 1);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: '/workspace/magiccad-ui.png' });
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
