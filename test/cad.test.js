import test from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../src/core.js';
import { CadSession, parsePoint, zoomView, selectWindow, move } from '../src/cad.js';
test('coordenadas CAD: mm, metros, relativas e eixo Y positivo para cima', () => {
  assert.deepEqual(parsePoint('4000,5000'), { x: 4000, y: -5000 });
  assert.deepEqual(parsePoint('4m,5m'), { x: 4000, y: -5000 });
  assert.deepEqual(parsePoint('@1000,-500', { x: 100, y: -200 }), { x: 1100, y: 300 });
  assert.deepEqual(parsePoint('@4m<90', { x: 0, y: 0 }), { x: 0, y: -4000 });
  assert.throws(() => parsePoint('0.1,0'), /precisão/);
  assert.throws(() => parsePoint('@1,0'), /referência/);
  assert.throws(() => parsePoint('@4000<45', { x: 0, y: 0 }), /precisão/);
});
test('LINE permanece ativo, U desfaz um segmento e C fecha o contorno', () => {
  const history = new History(), session = new CadSession(history);
  session.handle('l'); session.handle('0,0'); session.handle('@4000,0'); session.handle('@0,5000');
  assert.equal(history.project.entities.length, 2); assert.equal(session.mode, 'line');
  session.handle('u'); assert.equal(history.project.entities.length, 1);
  session.handle('@0,5000'); session.handle('c'); assert.equal(history.project.entities.length, 3); assert.equal(session.mode, null);
  assert.equal(history.project.entities[1].y2, -5000);
});
test('RECTANG é uma operação atómica e undo/redo restaura as quatro linhas', () => {
  const history = new History(), session = new CadSession(history);
  session.handle('rec'); session.handle('0,0'); session.handle('4000,5000');
  assert.equal(history.project.entities.length, 4); assert.equal(history.past.length, 1);
  session.handle('undo'); assert.equal(history.project.entities.length, 0);
  session.handle('redo'); assert.equal(history.project.entities.length, 4);
});
test('MOVE usa seleção, ponto base e deslocamento relativo; undo restaura tudo', () => {
  const history = new History(), session = new CadSession(history);
  session.handle('rec'); session.handle('0,0'); session.handle('4000,5000');
  session.selection = new Set(history.project.entities.map(e => e.id));
  session.handle('m'); session.handle('0,0'); session.handle('@1000,2000');
  assert.equal(history.project.entities[0].x1, 1000); assert.equal(history.project.entities[0].y1, -2000);
  session.handle('undo'); assert.equal(history.project.entities[0].x1, 0);
});
test('ERASE espera a confirmação e preserva os objetos não selecionados', () => {
  const history = new History(), session = new CadSession(history);
  session.handle('l'); session.handle('0,0'); session.handle('1000,0'); session.handle('1000,1000'); session.handle('');
  session.handle('e'); session.selection.add(history.project.entities[0].id);
  assert.equal(history.project.entities.length, 2); session.handle(''); assert.equal(history.project.entities.length, 1);
  session.handle('undo'); assert.equal(history.project.entities.length, 2);
});
test('movimento fora dos limites falha sem alterar o projeto ou o histórico', () => {
  const history = new History(); history.add({ id: 'l', type: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 });
  const snapshot = JSON.stringify(history.project), count = history.past.length;
  assert.throws(() => move(history, new Set(['l']), 1000000, 0));
  assert.equal(JSON.stringify(history.project), snapshot); assert.equal(history.past.length, count);
});
test('ZOOM ALL e EXTENTS incluem desenhos distantes e respeitam o formato da vista', () => {
  const entities = [{ id: 'l', type: 'line', x1: -900000, y1: 850000, x2: -890000, y2: 900000 }];
  for (const all of [true, false]) {
    const view = zoomView(entities, 2, all);
    assert.equal(view.width / view.height, 2);
    for (const p of [[-900000, 850000], [-890000, 900000]]) { assert.ok(p[0] >= view.x && p[0] <= view.x + view.width); assert.ok(p[1] >= view.y && p[1] <= view.y + view.height); }
  }
  const session = new CadSession(new History()); session.handle('z'); assert.equal(session.handle('a').action, 'zoom-all'); assert.equal(session.handle('zoom extents').action, 'zoom-extents');
});
test('janela contém e crossing cruza segmentos, sem falsos positivos de bounding box', () => {
  const lines = [{ id: 'diagonal', type: 'line', x1: 0, y1: 0, x2: 1000, y2: 1000 }];
  assert.deepEqual(selectWindow(lines, { x: -1, y: -1 }, { x: 1001, y: 1001 }), ['diagonal']);
  assert.deepEqual(selectWindow(lines, { x: 1000, y: 0 }, { x: 900, y: 100 }), []);
  assert.deepEqual(selectWindow(lines, { x: 600, y: 400 }, { x: 400, y: 600 }), ['diagonal']);
  assert.deepEqual(selectWindow(lines, { x: 400, y: 400 }, { x: 600, y: 600 }), []);
});
