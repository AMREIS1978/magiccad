import { mm, LIMIT, roomGeometry } from './core.js';
export function scalar(text, defaultUnit = 'mm') {
  const match = text.trim().match(/^(-?)(\d+(?:[.,]\d+)?)(mm|cm|m)?$/i);
  if (!match) throw new Error('Medida inválida. Usa milímetros ou um sufixo: 4000, 400cm, 4m.');
  if (/^0(?:[.,]0+)?$/.test(match[2])) return 0;
  return (match[1] ? -1 : 1) * mm(match[2], (match[3] ?? defaultUnit).toLowerCase());
}
export function parsePoint(text, base = null) {
  let input = text.trim(), relative = input.startsWith('@');
  if (relative) { if (!base) throw new Error('Define primeiro um ponto de referência.'); input = input.slice(1); }
  let x, y;
  if (input.includes('<')) {
    if (!relative) throw new Error('Coordenada polar: usa @distância<ângulo.');
    const parts = input.split('<'); if (parts.length !== 2 || !/^-?\d+(?:\.\d+)?$/.test(parts[1])) throw new Error('Ângulo inválido.');
    const distance = scalar(parts[0]), angle = Number(parts[1]) * Math.PI / 180;
    x = distance * Math.cos(angle); y = distance * Math.sin(angle);
    if (Math.abs(x - Math.round(x)) > 0.000001 || Math.abs(y - Math.round(y)) > 0.000001) throw new Error('A coordenada polar não cabe na precisão de 1 mm. Usa coordenadas cartesianas ou um ângulo de 0/90/180/270 graus.');
    x = Math.round(x); y = Math.round(y);
  } else {
    const parts = input.split(input.includes(';') ? ';' : ',');
    if (parts.length !== 2) throw new Error('Ponto: X,Y em mm; relativo: @X,Y. Exemplo: 0,0 ou @4000,0.');
    x = scalar(parts[0]); y = scalar(parts[1]);
  }
  const point = { x: x + (relative ? base.x : 0), y: -y + (relative ? base.y : 0) };
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) || Math.abs(point.x) > LIMIT || Math.abs(point.y) > LIMIT) throw new Error('Ponto fora dos limites de ±1000 m.');
  return point;
}
export function segments(entity) {
  if (entity.type === 'line') return [[{ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }]];
  const geometry = roomGeometry(entity);
  return [geometry.interior, geometry.exterior].flatMap(r => {
    const p = [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
    return p.map((point, i) => [point, p[(i + 1) % 4]]);
  });
}
export function bounds(entities, labels = false) {
  if (!entities.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const entity of entities) {
    for (const segment of segments(entity)) for (const p of segment) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    if (labels && entity.type === 'room') { minX = Math.min(minX, entity.x - entity.thickness - 450); minY = Math.min(minY, entity.y - entity.thickness - 450); }
  }
  return { minX, minY, maxX, maxY };
}
export function zoomView(entities, aspect, all = false) {
  const initial = { minX: -2000, minY: -2000, maxX: 12000, maxY: 8000 };
  let b = bounds(entities, true);
  if (!b) b = initial;
  else if (all) b = { minX: Math.min(initial.minX, b.minX), minY: Math.min(initial.minY, b.minY), maxX: Math.max(initial.maxX, b.maxX), maxY: Math.max(initial.maxY, b.maxY) };
  let width = Math.max(1000, b.maxX - b.minX) * 1.12, height = Math.max(1000, b.maxY - b.minY) * 1.12;
  if (width / height < aspect) width = height * aspect; else height = width / aspect;
  return { x: (b.minX + b.maxX - width) / 2, y: (b.minY + b.maxY - height) / 2, width, height };
}
function crosses(a, b, r) {
  let low = 0, high = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.minX], [dx, r.maxX - a.x], [-dy, a.y - r.minY], [dy, r.maxY - a.y]]) {
    if (p === 0) { if (q < 0) return false; }
    else { const t = q / p; if (p < 0) low = Math.max(low, t); else high = Math.min(high, t); if (low > high) return false; }
  }
  return true;
}
export function selectWindow(entities, a, b) {
  const rectangle = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
  const crossing = b.x < a.x;
  return entities.filter(entity => {
    const geometry = segments(entity);
    return crossing ? geometry.some(([first, last]) => crosses(first, last, rectangle)) : geometry.every(segment => segment.every(p => p.x >= rectangle.minX && p.x <= rectangle.maxX && p.y >= rectangle.minY && p.y <= rectangle.maxY));
  }).map(entity => entity.id);
}
export function erase(history, selection) {
  if (!selection.size) throw new Error('Seleciona pelo menos um objeto.');
  history.commit({ ...history.project, entities: history.project.entities.filter(e => !selection.has(e.id)) }); selection.clear();
}
export function move(history, selection, dx, dy, duplicate = false) {
  if (!selection.size) throw new Error('Seleciona pelo menos um objeto.');
  const translated = history.project.entities.filter(entity => !duplicate || selection.has(entity.id)).map(entity => {
    if (!selection.has(entity.id)) return entity;
    const identity = duplicate ? { id: crypto.randomUUID() } : {};
    return entity.type === 'room' ? { ...entity, ...identity, x: entity.x + dx, y: entity.y + dy } : { ...entity, ...identity, x1: entity.x1 + dx, y1: entity.y1 + dy, x2: entity.x2 + dx, y2: entity.y2 + dy };
  });
  history.commit({ ...history.project, entities: duplicate ? [...history.project.entities, ...translated] : translated });
}
export function offsetLine(history, selection, distance, side) {
  if (selection.size !== 1) throw new Error('OFFSET: seleciona uma única linha.');
  const line = history.project.entities.find(e => selection.has(e.id));
  if (!line || line.type !== 'line') throw new Error('OFFSET suporta linhas nesta versão.');
  if (!Number.isSafeInteger(distance) || distance <= 0) throw new Error('Distância positiva em milímetros.');
  const vx = line.x2 - line.x1, vy = line.y2 - line.y1, length = Math.hypot(vx, vy);
  const cross = vx * (side.y - line.y1) - vy * (side.x - line.x1);
  if (!cross) throw new Error('Indica um ponto fora da linha para escolher o lado.');
  const sign = Math.sign(cross), dx = -vy / length * distance * sign, dy = vx / length * distance * sign;
  if (Math.abs(dx - Math.round(dx)) > 1e-6 || Math.abs(dy - Math.round(dy)) > 1e-6) throw new Error('Este offset não cabe na precisão de 1 mm. Não foi arredondado.');
  history.add({ ...line, id: crypto.randomUUID(), x1: line.x1 + Math.round(dx), y1: line.y1 + Math.round(dy), x2: line.x2 + Math.round(dx), y2: line.y2 + Math.round(dy) });
}
const aliases = { co: 'copy', copy: 'copy', copiar: 'copy', o: 'offset', offset: 'offset', l: 'line', line: 'line', linha: 'line', rec: 'rect', rectang: 'rect', rectangle: 'rect', retangulo: 'rect', m: 'move', move: 'move', mover: 'move', e: 'erase', erase: 'erase', apagar: 'erase', z: 'zoom', zoom: 'zoom', za: 'all', ze: 'extents', u: 'undo', undo: 'undo', desfazer: 'undo', redo: 'redo', refazer: 'redo' };
export class CadSession {
  constructor(history) { this.history = history; this.selection = new Set(); this.mode = null; this.points = []; this.stage = null; this.lastCommand = null; }
  cancel() { this.mode = null; this.points = []; this.stage = null; return { message: 'Comando cancelado.' }; }
  prompt() {
    if (this.mode === 'line') return this.points.length ? 'LINE: próximo ponto [C Fechar / U Desfazer / Enter Terminar]' : 'LINE: primeiro ponto';
    if (this.mode === 'rect') return this.points.length ? 'RECTANG: canto oposto' : 'RECTANG: primeiro canto';
    if (this.mode === 'zoom') return 'ZOOM: [A All / E Extents]';
    if (this.mode === 'offset') return this.stage === 'distance' ? 'OFFSET: distância em mm (ou 20cm)' : this.stage === 'select' ? 'OFFSET: selecionar uma linha e Enter' : 'OFFSET: indicar o lado com um ponto';
    if (['move', 'copy'].includes(this.mode)) return this.stage === 'select' ? `${this.mode.toUpperCase()}: selecionar objetos e Enter` : this.stage === 'base' ? `${this.mode.toUpperCase()}: ponto base` : `${this.mode.toUpperCase()}: destino ou @deslocamento`;
    if (this.mode === 'erase') return 'ERASE: selecionar objetos e Enter';
    return 'Comando: L · REC · M · CO · O · E · Z A · Z E · U · REDO';
  }
  handle(text) {
    const input = text.trim(), key = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['esc', 'cancelar', 'cancel'].includes(key)) return this.cancel();
    if (['zoom all', 'z a', 'za', 'zoom a', 'zoom tudo'].includes(key)) { this.cancel(); return { action: 'zoom-all', message: 'ZOOM ALL: mostrar limites e todo o desenho.' }; }
    if (['zoom extents', 'z e', 'ze', 'zoom e', 'zoom extensoes'].includes(key)) { this.cancel(); return { action: 'zoom-extents', message: 'ZOOM EXTENTS: enquadrar todo o desenho.' }; }
    if (this.mode === 'zoom') {
      if (['a', 'all', 'tudo'].includes(key)) return this.handle('z a');
      if (['e', 'extents', 'extensoes'].includes(key)) return this.handle('z e');
      throw new Error(this.prompt());
    }
    if (this.mode === 'line' && key === 'u') {
      if (this.points.length > 1) { this.history.undo(); this.points.pop(); }
      return { message: this.prompt() };
    }
    if (this.mode === 'line' && ['c', 'close', 'fechar'].includes(key)) {
      if (this.points.length < 3) throw new Error('Define pelo menos três pontos antes de fechar.');
      if (this.points.at(-1).x !== this.points[0].x || this.points.at(-1).y !== this.points[0].y) this.point(this.points[0]);
      this.cancel(); return { message: 'LINE: contorno fechado.' };
    }
    if (!input) {
      if (this.mode === 'line') { this.cancel(); return { message: 'LINE terminado.' }; }
      if (this.mode === 'erase') { erase(this.history, this.selection); this.cancel(); return { message: 'Objetos apagados. U para desfazer.' }; }
      if (['move', 'copy', 'offset'].includes(this.mode) && this.stage === 'select') {
        if (!this.selection.size) throw new Error('Seleciona objetos e carrega em Enter.');
        if (this.mode === 'offset' && this.selection.size !== 1) throw new Error('Seleciona uma única linha.');
        this.stage = this.mode === 'offset' ? 'side' : 'base'; return { message: this.prompt() };
      }
      if (!this.mode && this.lastCommand) return this.handle(this.lastCommand);
      return { message: this.prompt() };
    }
    const command = aliases[key];
    if (command) {
      if (command === 'undo' || command === 'redo') { this.cancel(); this.history[command](); this.selection.clear(); return { message: command === 'undo' ? 'Operação desfeita.' : 'Operação refeita.' }; }
      if (command === 'all' || command === 'extents') return this.handle(command === 'all' ? 'z a' : 'z e');
      this.cancel(); this.mode = command; this.lastCommand = input;
      if (['move', 'copy'].includes(command)) this.stage = this.selection.size ? 'base' : 'select';
      if (command === 'offset') this.stage = 'distance';
      return { message: this.prompt() };
    }
    if (this.mode === 'offset' && this.stage === 'distance') {
      this.distance = scalar(input); if (this.distance <= 0) throw new Error('A distância deve ser positiva.');
      this.stage = this.selection.size === 1 ? 'side' : 'select'; return { message: this.prompt() };
    }
    if (this.mode && ['line', 'rect', 'move', 'copy', 'offset'].includes(this.mode) && this.stage !== 'select') return this.point(parsePoint(input, this.points.at(-1)));
    throw new Error('Comando desconhecido. Usa L, REC, M, CO, O, E, Z A, Z E, U ou REDO.');
  }
  point(p) {
    if (!['line', 'rect', 'move', 'copy', 'offset'].includes(this.mode) || ['select', 'distance'].includes(this.stage)) throw new Error(this.prompt());
    if (!Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y) || Math.abs(p.x) > LIMIT || Math.abs(p.y) > LIMIT) throw new Error('Ponto inválido.');
    if (this.mode === 'offset') { offsetLine(this.history, this.selection, this.distance, p); this.cancel(); return { message: 'Linha paralela criada. U para desfazer.' }; }
    const previous = this.points.at(-1);
    if (!previous) { this.points.push(p); if (['move', 'copy'].includes(this.mode)) this.stage = 'target'; return { message: this.prompt() }; }
    const makeLine = (a, b) => ({ id: crypto.randomUUID(), type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    if (this.mode === 'line') { this.history.add(makeLine(previous, p)); this.points.push(p); }
    else if (this.mode === 'rect') {
      if (previous.x === p.x || previous.y === p.y) throw new Error('O retângulo precisa de largura e altura diferentes de zero.');
      const points = [previous, { x: p.x, y: previous.y }, p, { x: previous.x, y: p.y }];
      this.history.commit({ ...this.history.project, entities: [...this.history.project.entities, ...points.map((point, i) => makeLine(point, points[(i + 1) % 4]))] });
      this.cancel(); return { message: 'Retângulo criado. U desfaz o retângulo completo.' };
    } else { const copied = this.mode === 'copy'; move(this.history, this.selection, p.x - previous.x, p.y - previous.y, copied); this.cancel(); return { message: copied ? 'Objetos copiados. U para desfazer.' : 'Objetos movidos. U para desfazer.' }; }
    return { message: this.prompt() };
  }
}
