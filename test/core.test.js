import test from 'node:test';
import assert from 'node:assert/strict';
import { mm, parseCommand, roomGeometry, History, validateProject } from '../src/core.js';
const room = { id: 'room-1', type: 'room', name: 'Sala', x: 0, y: 0, width: 4000, height: 5000, thickness: 200 };
test('dimensões decimais são convertidas exatamente, sem arredondar', () => {
  assert.equal(mm('4,125'), 4125); assert.equal(mm('20', 'cm'), 200); assert.equal(mm('1', 'mm'), 1);
  for (const value of ['0', '-1', '1e3', '0.0001', '1001', 'Infinity', 'NaN']) assert.throws(() => mm(value));
});
test('interpretação portuguesa preserva dimensões interiores e espessura', () => {
  assert.deepEqual(parseCommand('Cria uma divisão de 4 x 5 metros com paredes de 20 cm'), { type: 'room', width: 4000, height: 5000, thickness: 200 });
  assert.equal(parseCommand('criar quarto de 3,5 × 4 m com paredes de 15 cm.').width, 3500);
  assert.throws(() => parseCommand('cria uma casa bonita'));
  assert.throws(() => parseCommand('cria uma divisão de 4 x 5 metros'));
});
test('paredes ficam fora das medidas interiores; área útil é 20 m²', () => {
  assert.deepEqual(roomGeometry(room), { interior: { x: 0, y: 0, width: 4000, height: 5000 }, exterior: { x: -200, y: -200, width: 4400, height: 5400 }, area: 20 });
});
test('operações são reversíveis e uma alteração invalida o ramo refazer', () => {
  const history = new History(); history.add(room);
  assert.equal(history.undo(), true); assert.equal(history.project.entities.length, 0);
  assert.equal(history.redo(), true); assert.deepEqual(history.project.entities[0], room);
  history.undo(); history.add({ ...room, id: 'another' }); assert.equal(history.redo(), false);
});
test('projetos sobrevivem à gravação/leitura e rejeitam dados inválidos', () => {
  const history = new History(); history.add(room);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(history.project))), history.project);
  for (const data of [null, { ...history.project, units: 'm' }, { ...history.project, version: 2 }, { ...history.project, entities: [room, room] }, { ...history.project, entities: [{ ...room, width: 4.5 }] }, { ...history.project, entities: [{ ...room, x: 1000000 }] }]) assert.throws(() => validateProject(data));
});
test('uma operação inválida nunca altera o projeto nem o histórico', () => {
  const history = new History(); assert.throws(() => history.add({ id: 'l', type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 }));
  assert.equal(history.project.entities.length, 0); assert.equal(history.past.length, 0);
});
test('apagar pode ser desfeito e as entradas do histórico não partilham referências externas', () => {
  const history = new History(); const source = { ...room }; history.add(source); source.width = 1;
  assert.equal(history.project.entities[0].width, 4000);
  history.remove(room.id); assert.equal(history.project.entities.length, 0); history.undo(); assert.equal(history.project.entities.length, 1);
});
