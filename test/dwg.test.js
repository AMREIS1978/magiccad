import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { History } from '../src/core.js';
import { exportDwg, importDwg } from '../src/dwg.js';
const binaries = process.env.LIBREDWG_BIN || '/workspace/.tools/libredwg-build';
test('DWG real R2000: conversão, assinatura e reabertura preservam contornos em milímetros', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'magiccad-test-'));
  try {
    const history = new History(); history.add({ id: 'r', type: 'room', name: 'Sala', x: 1250, y: -500, width: 4125, height: 5000, thickness: 200 });
    const target = join(temp, 'room.dwg');
    await exportDwg(history.project, target, binaries);
    assert.equal((await readFile(target)).subarray(0, 6).toString(), 'AC1015');
    const restored = await importDwg(target, binaries);
    assert.equal(restored.entities.length, 8);
    assert.equal(Math.min(...restored.entities.flatMap(e => [e.x1, e.x2])), 1050);
    assert.equal(Math.max(...restored.entities.flatMap(e => [e.x1, e.x2])), 5575);
    assert.equal(Math.min(...restored.entities.flatMap(e => [e.y1, e.y2])), -700);
    assert.equal(Math.max(...restored.entities.flatMap(e => [e.y1, e.y2])), 4700);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('falha do conversor preserva o ficheiro de destino existente', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'magiccad-test-'));
  try {
    const history = new History(); history.add({ id: 'l', type: 'line', x1: 0, y1: 0, x2: 100, y2: 200 });
    const target = join(temp, 'original.dwg'); await writeFile(target, 'original');
    await assert.rejects(exportDwg(history.project, target, join(temp, 'missing')), /LibreDWG não está instalado/);
    assert.equal(await readFile(target, 'utf8'), 'original');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
