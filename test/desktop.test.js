import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('desktop real: renderer isolado, ficheiros nativos e DWG através de IPC', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'magiccad-desktop-'));
  let application;
  try {
    application = await _electron.launch({ args: process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu', '.'] : ['.'], env: { ...process.env, XDG_CONFIG_HOME: join(temp, 'config'), XDG_CACHE_HOME: join(temp, 'cache'), XDG_DATA_HOME: join(temp, 'data') }, timeout: 20000 });
    const page = await application.firstWindow({ timeout: 10000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#ai-mode'); await page.locator('#ai-mode').click(); await page.waitForSelector('#example');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await page.locator('#example').click(); await page.getByRole('button', { name: 'Aplicar à planta' }).click();
    assert.equal(await page.locator('#entities > g').count(), 1);
    const projectPath = join(temp, 'project.magiccad.json'), dwgPath = join(temp, 'planta.dwg');
    await application.evaluate(({ dialog }, paths) => {
      dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: options.defaultPath.endsWith('.dwg') ? paths.dwg : paths.project });
      dialog.showOpenDialog = async (_window, options) => ({ canceled: false, filePaths: [options.filters[0].extensions[0] === 'dwg' ? paths.dwg : paths.project] });
    }, { project: projectPath, dwg: dwgPath });
    await page.locator('#save').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('guardado'));
    const stored = JSON.parse(await readFile(projectPath, 'utf8')); assert.equal(stored.entities[0].width, 4000);
    const exported = await page.evaluate(project => window.magiccad.exportDwg(project), stored); assert.equal(exported, 'planta.dwg');
    assert.equal((await readFile(dwgPath)).subarray(0, 6).toString(), 'AC1015');
    const imported = await page.evaluate(() => window.magiccad.importDwg()); assert.equal(imported.project.entities.length, 8);
    await page.locator('#open').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('aberto'));
    assert.equal(await page.locator('#entities > g').count(), 1); assert.deepEqual(errors, []);
    await page.locator('#manual-mode').click(); await page.locator('#fit').click();
    await page.screenshot({ path: '/workspace/magiccad-desktop.png' });
  } finally { await application?.close(); await rm(temp, { recursive: true, force: true }); }
});
