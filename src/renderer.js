import { History, mm, metres, roomGeometry, validateProject } from './core.js';
import { LocalAssistant } from './assistant.js';
import { CadSession, scalar, zoomView, segments, selectWindow, erase } from './cad.js';
const assistant = new LocalAssistant(), $ = id => document.getElementById(id);
let history = new History(), cad = new CadSession(history);
let saved = JSON.stringify(history.project), view = zoomView([], 1.4), drag = null, selectionDrag = null;
let ortho = false, osnap = true, snap = false, snapPoints = [], snapped = null, lastMiddle = null, fitMode = false;
const svgNS = 'http://www.w3.org/2000/svg', commandHistory = []; let commandIndex = 0;
function node(tag, attributes = {}, text) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
function status(text) { $('status').textContent = text; }
function message(text, user = false) {
  const element = document.createElement('div'); element.className = `message${user ? ' user' : ''}`; element.textContent = text; $('messages').append(element);
  while ($('messages').children.length > 50) $('messages').firstElementChild.remove();
  $('messages').scrollTop = $('messages').scrollHeight;
}
function cadMessage(text) {
  status(text); const line = document.createElement('div'); line.textContent = text; $('cad-history').append(line);
  while ($('cad-history').children.length > 30) $('cad-history').firstElementChild.remove();
  $('cad-history').scrollTop = $('cad-history').scrollHeight;
}
function applyView() { $('canvas').setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`); }
function fit(all = false) {
  fitMode = all; const rectangle = $('canvas').getBoundingClientRect(); view = zoomView(history.project.entities, rectangle.width / Math.max(1, rectangle.height), all); applyView();
}
function updatePrompt() {
  const text = cad.prompt(); $('cad-prompt').textContent = text; $('mode').textContent = cad.mode ? text : `${cad.selection.size} objeto(s) selecionado(s)`;
  $('cad-input').placeholder = cad.mode === 'zoom' ? 'A = All · E = Extents' : cad.mode === 'erase' || cad.stage === 'select' ? 'Seleciona objetos na planta; Enter confirma' : cad.mode ? 'X,Y em mm: 4000,5000 · @4000,0 · ou clica na planta' : 'L, REC, M, E, Z A… · 4000 mm = 4 m';
  for (const [id, mode] of [['select', null], ['line', 'line'], ['rectangle', 'rect'], ['move', 'move']]) $(id).classList.toggle('active', cad.mode === mode);
  $('canvas').classList.toggle('cad-drawing', ['line', 'rect', 'move'].includes(cad.mode));
}
function render() {
  $('entities').replaceChildren(); $('preview').replaceChildren(); snapped = null;
  for (const entity of history.project.entities) {
    const group = node('g', { 'data-id': entity.id, class: cad.selection.has(entity.id) ? 'selected' : '' });
    if (entity.type === 'room') {
      const { interior: i, exterior: o, area } = roomGeometry(entity), rectangle = r => `M${r.x},${r.y}h${r.width}v${r.height}h${-r.width}z`;
      group.append(node('path', { d: rectangle(o) + rectangle(i), 'fill-rule': 'evenodd', class: 'wall' }));
      group.append(node('text', { x: i.x + i.width / 2, y: i.y + i.height / 2 - 100, class: 'room-label' }, entity.name));
      group.append(node('text', { x: i.x + i.width / 2, y: i.y + i.height / 2 + 170, class: 'room-area' }, `${area.toLocaleString('pt-PT', { maximumFractionDigits: 6 })} m²`));
      group.append(node('text', { x: i.x + i.width / 2, y: o.y - 180, class: 'dimension', 'text-anchor': 'middle' }, `${metres(i.width)} m`));
      group.append(node('text', { x: o.x - 180, y: i.y + i.height / 2, class: 'dimension', transform: `rotate(-90 ${o.x - 180} ${i.y + i.height / 2})`, 'text-anchor': 'middle' }, `${metres(i.height)} m`));
    } else group.append(node('line', { x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2, class: 'cad-line' }));
    $('entities').append(group);
  }
  const geometry = history.project.entities.flatMap(segments);
  const middlePoints = geometry.map(([a,b]) => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2 })).filter(p => Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y));
  snapPoints = [...new Map([...geometry.flat(), ...middlePoints].map(p => [`${p.x},${p.y}`, p])).values()];
  $('undo').disabled = !history.past.length; $('redo').disabled = !history.future.length; $('delete').disabled = false;
  document.title = `${JSON.stringify(history.project) === saved ? '' : '• '}MagicCAD`;
  updatePrompt();
}
function runCad(text, focus = false) {
  try {
    const result = cad.handle(text); render();
    if (result.action?.startsWith('zoom-')) fit(result.action === 'zoom-all');
    cadMessage(result.message);
  } catch (error) { cadMessage(error.message); updatePrompt(); }
  if (focus) $('cad-input').focus();
}
function cancel() { assistant.cancel(); $('room-dialog').close(); cad.cancel(); cad.selection.clear(); selectionDrag = null; render(); status('Operação cancelada.'); }
function undo() { runCad('undo'); }
function redo() { runCad('redo'); }
function propose(command) {
  $('room-width').value = String(command.width / 1000); $('room-height').value = String(command.height / 1000); $('room-thickness').value = String(command.thickness / 10);
  $('room-name').value = command.name ?? `Divisão ${history.project.entities.filter(e => e.type === 'room').length + 1}`;
  $('room-x').value = '0'; $('room-y').value = '0'; $('room-error').textContent = ''; cad.cancel(); render(); $('room-dialog').showModal();
}
$('room-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const room = { id: crypto.randomUUID(), type: 'room', name: $('room-name').value.trim(), width: mm($('room-width').value), height: mm($('room-height').value), thickness: mm($('room-thickness').value, 'cm'), x: scalar($('room-x').value, 'm'), y: -scalar($('room-y').value, 'm') };
    history.add(room); cad.selection.clear(); cad.selection.add(room.id); $('room-dialog').close(); render(); fit();
    const result = `${room.name}: ${metres(room.width)} × ${metres(room.height)} m interiores; paredes ${room.thickness / 10} cm. Operação aplicada; podes desfazer.`;
    status(result); message(result);
  } catch (error) { $('room-error').textContent = error.message; }
});
$('cancel-room').onclick = cancel;
$('room-tool').onclick = () => propose({ width: 4000, height: 5000, thickness: 200 });
$('undo').onclick = undo; $('redo').onclick = redo;
$('fit').onclick = () => runCad('z a'); $('extents').onclick = () => runCad('z e');
$('delete').onclick = () => { try { erase(history, cad.selection); cad.cancel(); render(); cadMessage('Objetos apagados. U para desfazer.'); } catch { runCad('e', true); } };
$('select').onclick = () => { cad.cancel(); render(); status('Selecionar: clique ou janela. Esquerda→direita contém; direita→esquerda cruza. Shift remove.'); };
for (const [id, command] of [['line', 'l'], ['rectangle', 'rec'], ['move', 'm']]) $(id).onclick = () => runCad(command, true);
function setMode(manual) { document.body.classList.toggle('manual-mode', manual); $('manual-mode').setAttribute('aria-pressed', manual); $('ai-mode').setAttribute('aria-pressed', !manual); (manual ? $('cad-input') : $('command')).focus(); }
$('manual-mode').onclick = () => setMode(true); $('ai-mode').onclick = () => setMode(false);
function toggle(id) {
  if (id === 'ortho') ortho = !ortho; if (id === 'osnap') osnap = !osnap; if (id === 'snap') snap = !snap;
  $(id).setAttribute('aria-pressed', { ortho, osnap, snap }[id]); cadMessage(`${id.toUpperCase()} ${({ ortho, osnap, snap }[id]) ? 'ligado' : 'desligado'}.`);
}
for (const id of ['ortho', 'osnap', 'snap']) $(id).onclick = () => toggle(id);
function execute(text) {
  message(text, true);
  try {
    const command = assistant.interpret(text);
    if (command.type === 'room') { propose(command); message('Proposta preparada. Confirma as medidas e a posição antes de aplicar.'); }
    else if (command.type === 'undo') undo(); else if (command.type === 'redo') redo(); else if (command.type === 'cancel') cancel();
    else if (command.type === 'zoom-all') { runCad('z a'); message(command.message); }
    else { message(command.message); status(command.message); }
  } catch (error) { status(error.message); message(error.message); }
}
$('command-form').onsubmit = event => { event.preventDefault(); const text = $('command').value.trim(); if (text) { execute(text); $('command').value = ''; } };
$('command').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('command-form').requestSubmit(); } });
$('example').onclick = () => execute('Cria uma divisão de 4 x 5 metros com paredes de 20 cm');
$('cad-form').onsubmit = event => {
  event.preventDefault(); const text = $('cad-input').value;
  if (text) { commandHistory.push(text); commandIndex = commandHistory.length; }
  $('cad-input').value = ''; runCad(text, true);
};
$('cad-input').onkeydown = event => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); commandIndex = Math.max(0, Math.min(commandHistory.length, commandIndex + (event.key === 'ArrowUp' ? -1 : 1))); $('cad-input').value = commandHistory[commandIndex] ?? ''; }
  if (event.key === ' ' && !$('cad-input').value) { event.preventDefault(); $('cad-form').requestSubmit(); }
};
function point(event, constrain = false) {
  const matrix = $('canvas').getScreenCTM(); if (!matrix) return { x: 0, y: 0 };
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); snapped = null;
  if (!constrain) return { x: p.x, y: p.y };
  if (osnap) {
    let distance = (8 / matrix.a) ** 2;
    for (const candidate of snapPoints) { const squared = (candidate.x - p.x) ** 2 + (candidate.y - p.y) ** 2; if (squared <= distance) { distance = squared; snapped = candidate; } }
    if (snapped) return { ...snapped };
  }
  const previous = cad.points.at(-1); let fixedAxis = null;
  if (ortho && previous) { if (Math.abs(p.x - previous.x) >= Math.abs(p.y - previous.y)) { p.y = previous.y; fixedAxis = 'y'; } else { p.x = previous.x; fixedAxis = 'x'; } }
  const step = snap ? 10 : 1;
  return { x: fixedAxis === 'x' ? previous.x : Math.round(p.x / step) * step, y: fixedAxis === 'y' ? previous.y : Math.round(p.y / step) * step };
}
function preview(p) {
  $('preview').replaceChildren(); const previous = cad.points.at(-1);
  if (previous && cad.mode === 'rect') $('preview').append(node('rect', { x: Math.min(previous.x, p.x), y: Math.min(previous.y, p.y), width: Math.abs(p.x - previous.x), height: Math.abs(p.y - previous.y), class: 'preview-line', fill: 'none' }));
  else if (previous && cad.mode === 'move') {
    for (const entity of history.project.entities.filter(e => cad.selection.has(e.id))) for (const [a, b] of segments(entity)) $('preview').append(node('line', { x1: a.x + p.x - previous.x, y1: a.y + p.y - previous.y, x2: b.x + p.x - previous.x, y2: b.y + p.y - previous.y, class: 'preview-line' }));
  } else if (previous && cad.mode === 'line') $('preview').append(node('line', { x1: previous.x, y1: previous.y, x2: p.x, y2: p.y, class: 'preview-line' }));
  if (snapped) { const size = 5 / $('canvas').getScreenCTM().a; $('preview').append(node('rect', { x: snapped.x - size, y: snapped.y - size, width: size * 2, height: size * 2, class: 'snap-marker' })); }
}
$('canvas').onpointerdown = event => {
  if (event.button === 1) {
    event.preventDefault(); const now = performance.now();
    if (lastMiddle && now - lastMiddle.time < 350 && Math.hypot(event.clientX - lastMiddle.x, event.clientY - lastMiddle.y) < 5) { lastMiddle = null; drag = null; runCad('z e'); return; }
    lastMiddle = { time: now, x: event.clientX, y: event.clientY };
    fitMode = null; drag = { clientX: event.clientX, clientY: event.clientY, view: { ...view } }; $('canvas').setPointerCapture(event.pointerId); return;
  }
  if (event.button !== 0) return;
  $('canvas').focus();
  if (['line', 'rect', 'move'].includes(cad.mode) && cad.stage !== 'select') {
    try { const result = cad.point(point(event, true)); render(); cadMessage(result.message); } catch (error) { cadMessage(error.message); }
    return;
  }
  const id = event.target.closest('[data-id]')?.getAttribute('data-id');
  if (id) { if (event.shiftKey) cad.selection.delete(id); else cad.selection.add(id); render(); }
  else { selectionDrag = { start: point(event), clientX: event.clientX, clientY: event.clientY, remove: event.shiftKey, preserve: event.ctrlKey || event.shiftKey }; $('canvas').setPointerCapture(event.pointerId); }
};
$('canvas').onpointermove = event => {
  if (drag) {
    const matrix = $('canvas').getScreenCTM(); view.x = drag.view.x - (event.clientX - drag.clientX) / matrix.a; view.y = drag.view.y - (event.clientY - drag.clientY) / matrix.d; applyView();
  }
  const p = point(event, !!cad.mode && cad.stage !== 'select'); $('coordinates').textContent = `X ${metres(p.x)} · Y ${metres(-p.y)} m`;
  if (selectionDrag) {
    const a = selectionDrag.start; $('preview').replaceChildren(node('rect', { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(p.x - a.x), height: Math.abs(p.y - a.y), class: `selection-box${p.x < a.x ? ' crossing' : ''}` }));
  } else preview(p);
};
$('canvas').onpointerup = event => {
  drag = null;
  if (selectionDrag) {
    const data = selectionDrag; selectionDrag = null;
    if (Math.hypot(event.clientX - data.clientX, event.clientY - data.clientY) > 4) for (const id of selectWindow(history.project.entities, data.start, point(event))) { if (data.remove) cad.selection.delete(id); else cad.selection.add(id); }
    else if (!data.preserve) cad.selection.clear();
    render();
  }
};
$('canvas').onpointercancel = () => { drag = null; selectionDrag = null; $('preview').replaceChildren(); };
$('canvas').onlostpointercapture = () => { drag = null; };
$('canvas').onauxclick = event => event.preventDefault();
$('canvas').oncontextmenu = event => { event.preventDefault(); runCad(''); };
$('canvas').addEventListener('wheel', event => {
  event.preventDefault(); fitMode = null; const p = point(event), factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
  if (view.width * factor < 100 || view.width * factor > 6_000_000) return;
  view.x = p.x - (p.x - view.x) * factor; view.y = p.y - (p.y - view.y) * factor; view.width *= factor; view.height *= factor; applyView();
}, { passive: false });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
  if (!$('room-dialog').open && ['F3', 'F8', 'F9'].includes(event.key)) { event.preventDefault(); toggle({ F3: 'osnap', F8: 'ortho', F9: 'snap' }[event.key]); return; }
  if ($('room-dialog').open) return;
  if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); $('save').click(); return; }
  if (event.target === $('cad-input') && event.ctrlKey && ['z','y'].includes(event.key.toLowerCase())) { event.preventDefault(); event.key.toLowerCase() === 'y' || event.shiftKey ? redo() : undo(); return; }
  if (event.target.matches('input,textarea')) return;
  if (event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  else if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  else if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); $('save').click(); }
  else if (event.ctrlKey && event.key.toLowerCase() === 'a') { event.preventDefault(); cad.selection = new Set(history.project.entities.map(e => e.id)); render(); }
  else if (event.key === 'Delete') $('delete').click();
  else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); runCad('', true); }
  else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); $('cad-input').value += event.key; $('cad-input').focus(); }
});
new ResizeObserver(() => { const r = $('canvas').getBoundingClientRect(); if (r.height > 0) { if (fitMode !== null) view = zoomView(history.project.entities, r.width / r.height, fitMode); else { const width = view.height * r.width / r.height; view.x += (view.width - width) / 2; view.width = width; } applyView(); } }).observe($('canvas'));
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
    if (result) { history = new History(validateProject(result.project)); saved = JSON.stringify(history.project); cad = new CadSession(history); assistant.cancel(); $('filename').textContent = result.name; render(); fit(); status('Projeto aberto e validado.'); }
  } catch (error) { status(`Não foi possível abrir: ${error.message}`); }
};
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
      history = new History(result.project); saved = ''; cad = new CadSession(history); assistant.cancel();
      $('filename').textContent = result.name; render(); fit();
      status(`DWG importado: ${history.project.entities.length} linhas. Guarda em MagicCAD para continuar o projeto.`);
    }
  } catch (error) { status(`Não foi possível abrir DWG: ${error.message}`); }
  finally { $('import-dwg').disabled = false; }
};
