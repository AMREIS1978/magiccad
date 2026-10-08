import { validateProject, roomGeometry, emptyProject, LIMIT } from './core.js';
import { DxfWriter, point3d, Units } from '@tarikjabiri/dxf';
export function projectToDxf(project) {
  const data = validateProject(project);
  const drawing = new DxfWriter(); drawing.setUnits(Units.Millimeters);
  const layers = new Set(['0']);
  function line(x1, y1, x2, y2, layer) {
    if (!/^[A-Za-z0-9 _-]+$/.test(layer) || ['__proto__', 'constructor', 'prototype'].includes(layer)) throw new Error('Esta versão só exporta nomes de camadas ASCII simples.');
    if (!layers.has(layer)) { drawing.addLayer(layer, 7, 'CONTINUOUS'); layers.add(layer); }
    drawing.setCurrentLayerName(layer); drawing.addLine(point3d(x1, -y1), point3d(x2, -y2));
  }
  for (const entity of data.entities) {
    if (entity.type === 'line') line(entity.x1, entity.y1, entity.x2, entity.y2, entity.layer ?? 'DESENHO');
    else {
      const geometry = roomGeometry(entity);
      for (const r of [geometry.interior, geometry.exterior]) {
        line(r.x, r.y, r.x + r.width, r.y, 'PAREDES'); line(r.x + r.width, r.y, r.x + r.width, r.y + r.height, 'PAREDES');
        line(r.x + r.width, r.y + r.height, r.x, r.y + r.height, 'PAREDES'); line(r.x, r.y + r.height, r.x, r.y, 'PAREDES');
      }
    }
  }
  return drawing.stringify();
}
export function dxfToProject(text) {
  if (BufferByteLength(text) > 10_000_000) throw new Error('DXF excede o limite de 10 MB.');
  const lines = text.replace(/\r/g, '').trimEnd().split('\n');
  if (lines.length % 2) throw new Error('DXF mal formado.');
  const pairs = [];
  for (let index = 0; index < lines.length; index += 2) {
    if (!/^\s*\d+\s*$/.test(lines[index])) throw new Error('Código DXF inválido.');
    pairs.push([Number(lines[index]), lines[index + 1].trim()]);
  }
  const unitIndex = pairs.findIndex(([code, value]) => code === 9 && value === '$INSUNITS');
  const unitCode = unitIndex >= 0 && pairs[unitIndex + 1]?.[0] === 70 ? Number(pairs[unitIndex + 1][1]) : 0;
  const factor = { 4: 1, 5: 10, 6: 1000 }[unitCode];
  if (!factor) throw new Error('O DWG precisa de unidades declaradas em mm, cm ou m ($INSUNITS). Não vou adivinhar a escala.');
  function coordinate(raw, negate = false) {
    const value = Number(raw) * factor * (negate ? -1 : 1), nearest = Math.round(value);
    // Tolerance only for floating point serialization noise, far below geometric resolution.
    if (!Number.isFinite(value) || Math.abs(value - nearest) > 0.000001 || Math.abs(nearest) > LIMIT) throw new Error('Coordenada incompatível com a precisão de 1 mm ou os limites do projeto.');
    return Object.is(nearest, -0) ? 0 : nearest;
  }
  const project = emptyProject(); let section = null, current = null;
  function flush() {
    if (!current) return;
    const get = (code, fallback) => current.pairs.find(p => p[0] === code)?.[1] ?? fallback;
    const zero = codes => codes.every(code => Number(get(code, '0')) === 0);
    if (!zero([30, 31, 38, 39, 210, 220]) || Number(get(230, '1')) !== 1 || Number(get(67, '0')) !== 0) throw new Error('O DWG contém geometria 3D, espessura, extrusão ou espaço de papel ainda não suportados.');
    const layer = get(8, '0');
    const add = (a, b) => project.entities.push({ id: `dwg-${project.entities.length + 1}`, type: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], layer });
    if (current.type === 'LINE') {
      if ([10, 20, 11, 21].some(code => get(code) === undefined)) throw new Error('Linha DXF incompleta.');
      add([coordinate(get(10)), coordinate(get(20), true)], [coordinate(get(11)), coordinate(get(21), true)]);
    } else if (current.type === 'LWPOLYLINE') {
      if (current.pairs.some(([code, value]) => [40, 41, 42, 43].includes(code) && Number(value) !== 0)) throw new Error('Polilinhas com arcos ou largura ainda não são suportadas.');
      const vertices = [];
      for (const [code, value] of current.pairs) {
        if (code === 10) vertices.push([coordinate(value)]);
        if (code === 20) { if (!vertices.length || vertices.at(-1).length !== 1) throw new Error('Polilinha mal formada.'); vertices.at(-1).push(coordinate(value, true)); }
      }
      if (vertices.length < 2 || vertices.some(p => p.length !== 2) || Number(get(90)) !== vertices.length) throw new Error('Polilinha incompleta.');
      for (let i = 1; i < vertices.length; i++) add(vertices[i - 1], vertices[i]);
      if (Number(get(70, '0')) & 1) add(vertices.at(-1), vertices[0]);
    } else throw new Error(`O DWG contém ${current.type}, ainda não suportado. A importação foi interrompida para evitar perda silenciosa de objetos.`);
    current = null;
  }
  for (let index = 0; index < pairs.length; index++) {
    const [code, value] = pairs[index];
    if (code === 0 && value === 'SECTION') { flush(); section = pairs[++index]?.[1]; continue; }
    if (code === 0 && value === 'ENDSEC') { flush(); section = null; continue; }
    if (section !== 'ENTITIES') continue;
    if (code === 0) { flush(); current = { type: value, pairs: [] }; }
    else if (current) current.pairs.push([code, value]);
  }
  flush();
  if (!project.entities.length) throw new Error('Não foi encontrada geometria 2D suportada no DWG.');
  return validateProject(project);
}
function BufferByteLength(text) { return new TextEncoder().encode(text).length; }
