import { History, mm, metres, roomGeometry, validateProject, LIMIT } from './core.js';
import { LocalAssistant } from './assistant.js';
const assistant = new LocalAssistant();
const $ = id => document.getElementById(id);
let history = new History(), selected = null, tool = 'select', firstPoint = null;
let saved = JSON.stringify(history.project), view = { x: -2000, y: -2000, width: 14000, height: 10000 }, drag = null;
const svgNS = 'http://www.w3.org/2000/svg';
function node(tag, attributes = {}, text) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
function status(message) { $('status').textContent = message; }
function message(text, user = false) {
  const element = document.createElement('div'); element.className = `message${user ? ' user' : ''}`; element.textContent = text;
  $('messages').append(element);
  while ($('messages').children.length > 50) $('messages').firstElementChild.remove();
  $('messages').scrollTop = $('messages').scrollHeight;
}
function applyView() { $('canvas').setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`); }
function render() {
  $('entities').replaceChildren();
  for (const entity of history.project.entities) {
    const group = node('g', { 'data-id': entity.id, class: selected === entity.id ? 'selected' : '' });
    if (entity.type === 'room') {
      const { interior: i, exterior: o, area } = roomGeometry(entity);
      const rectangle = r => `M${r.x},${r.y}h${r.width}v${r.height}h${-r.width}z`;
      group.append(node('path', { d: rectangle(o) + rectangle(i), 'fill-rule': 'evenodd', class: 'wall' }));
      group.append(node('text', { x: i.x + i.width / 2, y: i.y + i.height / 2 - 100, class: 'room-label' }, entity.name));
      group.append(node('text', { x: i.x + i.width / 2, y: i.y + i.height / 2 + 170, class: 'room-area' }, `${area.toLocaleString('pt-PT', { maximumFractionDigits: 6 })} m²`));
      group.append(node('text', { x: i.x + i.width / 2, y: o.y - 180, class: 'dimension', 'text-anchor': 'middle' }, `${metres(i.width)} m`));
      group.append(node('text', { x: o.x - 180, y: i.y + i.height / 2, class: 'dimension', transform: `rotate(-90 ${o.x - 180} ${i.y + i.height / 2})`, 'text-anchor': 'middle' }, `${metres(i.height)} m`));
    } else group.append(node('line', { x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2, class: 'cad-line' }));
    $('entities').append(group);
  }
  $('undo').disabled = !history.past.length; $('redo').disabled = !history.future.length; $('delete').disabled = !selected;
  document.title = `${JSON.stringify(history.project) === saved ? '' : '• '}MagicCAD`;
}
function fit() {
  const points = history.project.entities.flatMap(e => e.type === 'room' ? [[e.x - e.thickness, e.y - e.thickness], [e.x + e.width + e.thickness, e.y + e.height + e.thickness]] : [[e.x1, e.y1], [e.x2, e.y2]]);
  if (!points.length) view = { x: -2000, y: -2000, width: 14000, height: 10000 };
  else {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    view = { x: x - 1200, y: y - 1200, width: Math.max(3000, Math.max(...xs) - x + 2400), height: Math.max(3000, Math.max(...ys) - y + 2400) };
  }
  applyView();
}
function setTool(next) {
  tool = next; firstPoint = null; $('preview').replaceChildren();
  $('select').classList.toggle('active', tool === 'select'); $('line').classList.toggle('active', tool === 'line');
  $('mode').textContent = tool === 'line' ? 'Linha · escolhe o primeiro ponto' : 'Selecionar';
}
function cancel() { assistant.cancel(); $('room-dialog').close(); setTool('select'); status('Operação cancelada.'); }
function coordinate(value) {
  const raw = String(value).trim();
  if (/^-?0(?:[.,]0+)?$/.test(raw)) return 0;
  return raw.startsWith('-') ? -mm(raw.slice(1)) : mm(raw);
}
function propose(command) {
  $('room-width').value = String(command.width / 1000); $('room-height').value = String(command.height / 1000); $('room-thickness').value = String(command.thickness / 10);
  $('room-name').value = `Divisão ${history.project.entities.filter(e => e.type === 'room').length + 1}`;
  $('room-x').value = '0'; $('room-y').value = '0'; $('room-error').textContent = ''; setTool('select'); $('room-dialog').showModal();
}
$('room-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const room = { id: crypto.randomUUID(), type: 'room', name: $('room-name').value.trim(), width: mm($('room-width').value), height: mm($('room-height').value), thickness: mm($('room-thickness').value, 'cm'), x: coordinate($('room-x').value), y: coordinate($('room-y').value) };
    history.add(room); selected = room.id; $('room-dialog').close(); render(); fit();
    const result = `${room.name}: ${metres(room.width)} × ${metres(room.height)} m interiores; paredes ${room.thickness / 10} cm. Operação aplicada; podes desfazer.`;
    status(result); message(result);
  } catch (error) { $('room-error').textContent = error.message; }
});
$('cancel-room').onclick = cancel;
$('room-tool').onclick = () => propose({ width: 4000, height: 5000, thickness: 200 });
function undo() { if (history.undo()) { selected = null; render(); status('Última operação desfeita.'); } }
function redo() { if (history.redo()) { selected = null; render(); status('Operação refeita.'); } }
$('undo').onclick = undo; $('redo').onclick = redo; $('fit').onclick = fit;
$('delete').onclick = () => { if (selected) { history.remove(selected); selected = null; render(); status('Objeto apagado. Podes desfazer.'); } };
$('select').onclick = () => setTool('select'); $('line').onclick = () => { setTool('line'); status('Linha: escolhe dois pontos na grelha. Esc cancela.'); };
function execute(text) {
  message(text, true);
  try {
    const command = assistant.interpret(text);
    if (command.type === 'room') { propose(command); message('Proposta preparada. Confirma as medidas e a posição antes de aplicar.'); }
    else if (command.type === 'undo') undo(); else if (command.type === 'redo') redo(); else if (command.type === 'cancel') cancel(); else { message(command.message); status(command.message); }
  } catch (error) { status(error.message); message(error.message); }
}
$('command-form').onsubmit = event => { event.preventDefault(); const text = $('command').value.trim(); if (text) { execute(text); $('command').value = ''; } };
$('example').onclick = () => execute('Cria uma divisão de 4 x 5 metros com paredes de 20 cm');
function point(event, snap = false) {
  const matrix = $('canvas').getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: snap ? Math.round(p.x / 10) * 10 : p.x, y: snap ? Math.round(p.y / 10) * 10 : p.y };
}
$('canvas').onpointerdown = event => {
  if (event.button === 1) { event.preventDefault(); drag = { clientX: event.clientX, clientY: event.clientY, point: point(event), view: { ...view } }; $('canvas').setPointerCapture(event.pointerId); return; }
  if (event.button !== 0) return;
  $('canvas').focus();
  if (tool === 'line') {
    const p = point(event, true);
    if (Math.abs(p.x) > LIMIT || Math.abs(p.y) > LIMIT) { status('Ponto fora dos limites do projeto.'); return; }
    if (!firstPoint) { firstPoint = p; $('mode').textContent = 'Linha · escolhe o segundo ponto'; }
    else {
      try { history.add({ id: crypto.randomUUID(), type: 'line', x1: firstPoint.x, y1: firstPoint.y, x2: p.x, y2: p.y }); setTool('select'); render(); status('Linha criada. Podes desfazer.'); }
      catch (error) { status(error.message); }
    }
  } else { selected = event.target.closest('[data-id]')?.getAttribute('data-id') ?? null; render(); }
};
$('canvas').onpointermove = event => {
  if (drag) {
    const matrix = $('canvas').getScreenCTM();
    const delta = new DOMPoint(event.clientX - drag.clientX, event.clientY - drag.clientY).matrixTransform(new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, 0, 0]).inverse());
    view.x = drag.view.x - delta.x; view.y = drag.view.y - delta.y; applyView();
  }
  const p = point(event, tool === 'line'); $('coordinates').textContent = `X ${metres(p.x)} · Y ${metres(p.y)} m`;
  if (firstPoint) $('preview').replaceChildren(node('line', { x1: firstPoint.x, y1: firstPoint.y, x2: p.x, y2: p.y, class: 'preview-line' }));
};
function endDrag() { drag = null; }
$('canvas').onpointerup = endDrag; $('canvas').onpointercancel = endDrag; $('canvas').onlostpointercapture = endDrag;
$('canvas').addEventListener('wheel', event => {
  event.preventDefault(); const p = point(event), factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
  if (view.width * factor < 500 || view.width * factor > 2_000_000) return;
  view.x = p.x - (p.x - view.x) * factor; view.y = p.y - (p.y - view.y) * factor; view.width *= factor; view.height *= factor; applyView();
}, { passive: false });
$('save').onclick = async () => {
  if (!window.magiccad) { status('A gravação de ficheiros requer a aplicação desktop.'); return; }
  try {
    const snapshot = structuredClone(history.project), name = await window.magiccad.save(snapshot);
    if (name) { saved = JSON.stringify(snapshot); $('filename').textContent = name; render(); status('Projeto guardado em formato MagicCAD.'); }
  } catch (error) { status(`Não foi possível guardar: ${error.message}`); }
};
$('open').onclick = async () => {
  if (!window.magiccad) { status('A abertura de ficheiros requer a aplicação desktop.'); return; }
  if (JSON.stringify(history.project) !== saved && !window.confirm('Há alterações por guardar. Queres abrir outro projeto e descartá-las?')) return;
  try {
    const result = await window.magiccad.open();
    if (result) { history = new History(validateProject(result.project)); saved = JSON.stringify(history.project); selected = null; setTool('select'); $('filename').textContent = result.name; render(); fit(); status('Projeto aberto e validado.'); }
  } catch (error) { status(`Não foi possível abrir: ${error.message}`); }
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { cancel(); return; }
  if (event.target.matches('input,textarea') || $('room-dialog').open) return;
  if (event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); $('save').click(); }
  if (event.key === 'Delete') $('delete').click();
});
window.addEventListener('beforeunload', event => {
  if (JSON.stringify(history.project) !== saved) {
    if (!window.confirm('Há alterações por guardar. Queres fechar e descartá-las?')) { event.preventDefault(); event.returnValue = ''; }
  }
});
render(); applyView();

$('export-dwg').onclick = async () => {
  if (!window.magiccad?.exportDwg) { status('O DWG requer a aplicação desktop e o LibreDWG.'); return; }
  if (!history.project.entities.length) { status('Desenha geometria antes de exportar.'); return; }
  if (!window.confirm('Exportar os contornos e linhas em DWG R2000? Os nomes, áreas e cotas visuais das divisões não são exportados nesta versão. Guarda também o projeto MagicCAD para preservar as divisões editáveis.')) return;
  $('export-dwg').disabled = true;
  try { const name = await window.magiccad.exportDwg(structuredClone(history.project)); if (name) status(`DWG R2000 exportado e relido: ${name}.`); }
  catch (error) { status(`Não foi possível exportar DWG: ${error.message}`); }
  finally { $('export-dwg').disabled = false; }
};
$('import-dwg').onclick = async () => {
  if (!window.magiccad?.importDwg) { status('O DWG requer a aplicação desktop e o LibreDWG.'); return; }
  if (JSON.stringify(history.project) !== saved && !window.confirm('Há alterações por guardar. Queres abrir o DWG e descartá-las?')) return;
  $('import-dwg').disabled = true;
  try {
    const result = await window.magiccad.importDwg();
    if (result) {
      history = new History(result.project); saved = ''; selected = null; assistant.cancel(); setTool('select');
      $('filename').textContent = result.name; render(); fit();
      status(`DWG importado: ${history.project.entities.length} linhas. Guarda em MagicCAD para continuar o projeto.`);
    }
  } catch (error) { status(`Não foi possível abrir DWG: ${error.message}`); }
  finally { $('import-dwg').disabled = false; }
};
