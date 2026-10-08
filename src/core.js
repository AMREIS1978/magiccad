// Integer millimetres. Never silently round a supplied architectural dimension.
export const LIMIT = 1_000_000;
export function mm(value, unit = 'm') {
  const input = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error('Indique uma medida positiva, sem arredondamentos.');
  const [whole, fraction = ''] = input.split('.');
  const factor = { m: 1000n, cm: 10n, mm: 1n }[unit];
  if (!factor) throw new Error('Unidade desconhecida. Utilize m, cm ou mm.');
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * factor;
  if (numerator % scale !== 0n) throw new Error('Esta versão aceita precisão de 1 mm; a medida não foi arredondada.');
  const result = Number(numerator / scale);
  if (!Number.isSafeInteger(result) || result <= 0 || result > LIMIT) throw new Error('A medida deve estar entre 1 mm e 1000 m.');
  return result;
}
export function metres(value) { return (value / 1000).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 3 }); }
function integer(value, minimum = -LIMIT, maximum = LIMIT) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Coordenada ou dimensão inválida.');
  return value;
}
export function validateEntity(entity) {
  if (!entity || typeof entity !== 'object' || typeof entity.id !== 'string' || !entity.id || entity.id.length > 100) throw new Error('Objeto inválido.');
  if (entity.type === 'room') {
    const x = integer(entity.x), y = integer(entity.y);
    const width = integer(entity.width, 1), height = integer(entity.height, 1);
    const thickness = integer(entity.thickness, 1, 1000);
    if (typeof entity.name !== 'string' || !entity.name.trim() || entity.name.length > 80) throw new Error('Nome de divisão inválido.');
    integer(x - thickness); integer(y - thickness); integer(x + width + thickness); integer(y + height + thickness);
    const doors = entity.doors ?? [];
    if (!Array.isArray(doors) || doors.length > 100) throw new Error('Lista de portas inválida.');
    const checked = doors.map(d => {
      if (!d || !['north','south','east','west'].includes(d.wall)) throw new Error('Parede da porta inválida.');
      const offset = integer(d.offset, 0), size = integer(d.width, 1), leafThickness = integer(d.leafThickness ?? 40, 1, 200), frameWidth = integer(d.frameWidth ?? 30, 2, 200), length = ['north','south'].includes(d.wall) ? width : height;
      if (offset + size > length) throw new Error('A porta ultrapassa o comprimento da parede.');
      if (size - 2 * frameWidth <= leafThickness) throw new Error('O vão é demasiado estreito para a moldura e a espessura da folha.');
      if (!['start','end'].includes(d.hinge)) throw new Error('Dobradiça inválida.');
      if (size > (['north','south'].includes(d.wall) ? height : width)) throw new Error('A folha da porta não cabe no interior da divisão.');
      return { wall: d.wall, offset, width: size, hinge: d.hinge, leafThickness, frameWidth };
    });
    checked.forEach((d, i) => { if (checked.slice(0,i).some(other => other.wall === d.wall && d.offset < other.offset + other.width && other.offset < d.offset + d.width)) throw new Error('As portas sobrepõem-se.'); });
    return { id: entity.id, type: 'room', name: entity.name, x, y, width, height, thickness, ...(checked.length ? { doors: checked } : {}) };
  }
  if (entity.type === 'arc') {
    const cx=integer(entity.cx), cy=integer(entity.cy), radius=integer(entity.radius,1);
    const startAngle=integer(entity.startAngle,0,359), endAngle=integer(entity.endAngle,0,359);
    if(startAngle%90 || endAngle%90 || (endAngle-startAngle+360)%360!==90) throw new Error('Só são suportados arcos de 90° alinhados com os eixos.');
    const layer=entity.layer ?? 'PORTAS';
    if(typeof layer!=='string' || !layer || layer.length>255 || /[\r\n]/.test(layer)) throw new Error('Camada inválida.');
    const arc={id:entity.id,type:'arc',cx,cy,radius,startAngle,endAngle,layer};
    for(const p of arcPoints(arc)) {integer(p.x);integer(p.y);}
    return arc;
  }
  if (entity.type === 'line') {
    const x1 = integer(entity.x1), y1 = integer(entity.y1), x2 = integer(entity.x2), y2 = integer(entity.y2);
    if (x1 === x2 && y1 === y2) throw new Error('Uma linha precisa de dois pontos distintos.');
    const layer = entity.layer ?? 'DESENHO';
    if (typeof layer !== 'string' || !layer || layer.length > 255 || /[\r\n]/.test(layer)) throw new Error('Camada inválida.');
    return { id: entity.id, type: 'line', x1, y1, x2, y2, layer };
  }
  throw new Error('Tipo de objeto não suportado.');
}
export function emptyProject() { return { format: 'magiccad', version: 3, units: 'mm', entities: [] }; }
export function validateProject(data) {
  if (!data || data.format !== 'magiccad' || ![1, 2, 3].includes(data.version) || data.units !== 'mm' || !Array.isArray(data.entities) || data.entities.length > 10000) throw new Error('Formato de projeto inválido ou versão não suportada.');
  const entities = data.entities.map(validateEntity);
  if (new Set(entities.map(e => e.id)).size !== entities.length) throw new Error('O projeto contém identificadores repetidos.');
  return { ...emptyProject(), entities };
}
export function roomGeometry(room) {
  const r = validateEntity(room), t = r.thickness;
  return {
    interior: { x: r.x, y: r.y, width: r.width, height: r.height },
    exterior: { x: r.x - t, y: r.y - t, width: r.width + 2 * t, height: r.height + 2 * t },
    area: r.width * r.height / 1_000_000
  };
}
export class History {
  constructor(project = emptyProject()) { this.project = validateProject(project); this.past = []; this.future = []; }
  commit(next) {
    const validated = validateProject(next);
    this.past.push(this.project);
    if (this.past.length > 100) this.past.shift();
    this.project = validated; this.future = [];
  }
  add(entity) { this.commit({ ...this.project, entities: [...this.project.entities, entity] }); }
  remove(id) { if (this.project.entities.some(e => e.id === id)) this.commit({ ...this.project, entities: this.project.entities.filter(e => e.id !== id) }); }
  undo() { if (!this.past.length) return false; this.future.push(this.project); this.project = this.past.pop(); return true; }
  redo() { if (!this.future.length) return false; this.past.push(this.project); this.project = this.future.pop(); return true; }
}
// Constrained commands, deliberately not advertised as general AI.
export function parseCommand(text) {
  const input = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(desfazer|undo|u)$/.test(input)) return { type: 'undo' };
  if (/^(refazer|redo)$/.test(input)) return { type: 'redo' };
  if (/^(cancelar|parar|esc)$/.test(input)) return { type: 'cancel' };
  const match = input.match(/^(?:cria|criar) (?:uma )?(?:divisao|sala|quarto) (?:de )?(\d+(?:[.,]\d+)?)\s*(?:x|×)\s*(\d+(?:[.,]\d+)?)\s*(m|metros?) (?:com )?paredes (?:de )?(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\.?$/);
  if (!match) throw new Error('Experimente: cria uma divisão de 4 x 5 metros com paredes de 20 cm. Também aceito desfazer, refazer e cancelar.');
  return { type: 'room', width: mm(match[1]), height: mm(match[2]), thickness: mm(match[4], match[5]) };
}

// Doors belong to their room: translation, copy, undo and project persistence stay atomic.
export function doorGeometry(room, door) {
  const { x, y, width: w, height: h, thickness: t } = room;
  const horizontal = ['north','south'].includes(door.wall), north = door.wall === 'north', west = door.wall === 'west';
  const start = horizontal ? { x: x + door.offset, y: north ? y : y+h } : { x: west ? x : x+w, y: y+door.offset };
  const end = { x: start.x + (horizontal ? door.width : 0), y: start.y + (horizontal ? 0 : door.width) };
  const delta = horizontal ? { x: 0, y: north ? -t : t } : { x: west ? -t : t, y: 0 };
  const outerStart = { x: start.x+delta.x, y: start.y+delta.y }, outerEnd = { x: end.x+delta.x, y: end.y+delta.y };
  const f=door.frameWidth ?? 30, leafThickness=door.leafThickness ?? 40;
  const along=horizontal ? {x:1,y:0} : {x:0,y:1}, inward=horizontal ? {x:0,y:north?1:-1} : {x:west?1:-1,y:0};
  const transform=(u,n)=>({x:start.x+along.x*u+inward.x*n,y:start.y+along.y*u+inward.y*n});
  const clearWidth=door.width-2*f, hingeU=door.hinge==='start'?f:door.width-f, side=door.hinge==='start'?1:-1;
  const hinge=transform(hingeU,0), tip=transform(hingeU,clearWidth);
  const leaf=[hinge,transform(hingeU+side*leafThickness,0),transform(hingeU+side*leafThickness,clearWidth),tip];
  const rebate=Math.floor(f/2), stopDepth=Math.min(f,t);
  const profile=[[0,-t],[rebate,-t],[rebate,-stopDepth],[f,-stopDepth],[f,0],[0,0]];
  const frames=[profile.map(([u,n])=>transform(u,n)),profile.map(([u,n])=>transform(door.width-u,n))].map(points=>points.filter((p,i)=>!i || p.x!==points[i-1].x || p.y!==points[i-1].y));
  const closed=transform(hingeU+side*clearWidth,0);
  const angle=p=>((Math.round(Math.atan2(-(p.y-hinge.y),p.x-hinge.x)*180/Math.PI)+360)%360);
  const closedAngle=angle(closed),openAngle=angle(tip),startAngle=(openAngle-closedAngle+360)%360===90?closedAngle:openAngle;
  const arc={id:'door-arc',type:'arc',cx:hinge.x,cy:hinge.y,radius:clearWidth,startAngle,endAngle:(startAngle+90)%360,layer:'PORTAS'};
  return { start, end, outerStart, outerEnd, hinge, tip, leaf, frames, arc, clearWidth };

}
export function roomSegments(room, includeDoorSymbol = true) {
  const { interior, exterior } = roomGeometry(room), doors = room.doors ?? [];
  const output = [];
  for (const r of [interior, exterior]) {
    for (const wall of ['north','east','south','west']) {
      const horizontal = ['north','south'].includes(wall), fixed = horizontal ? (wall === 'north' ? r.y : r.y+r.height) : (wall === 'west' ? r.x : r.x+r.width);
      const low = horizontal ? r.x : r.y, high = low + (horizontal ? r.width : r.height);
      const gaps = doors.filter(d => d.wall === wall).map(d => { const g=doorGeometry(room,d); return [horizontal ? g.start.x : g.start.y, horizontal ? g.end.x : g.end.y]; }).sort((a,b)=>a[0]-b[0]);
      let cursor=low;
      const add=(a,b)=>{ if(a<b) output.push(horizontal ? [{x:a,y:fixed},{x:b,y:fixed}] : [{x:fixed,y:a},{x:fixed,y:b}]); };
      for (const [a,b] of gaps) { add(cursor,a); cursor=b; } add(cursor,high);
    }
  }
  for (const d of doors) { const g=doorGeometry(room,d); output.push([g.start,g.outerStart],[g.end,g.outerEnd]); if(includeDoorSymbol) { for(const polygon of [...g.frames,g.leaf]) for(let i=0;i<polygon.length;i++) output.push([polygon[i],polygon[(i+1)%polygon.length]]); } }
  return [...new Map(output.map(segment=>{ const key=segment.map(p=>[p.x,p.y]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);return [JSON.stringify(key),segment]; })).values()];
}
export function insertDoor(history, roomId, door) {
  const room=history.project.entities.find(e=>e.id===roomId && e.type==='room');
  if (!room) throw new Error('Seleciona uma divisão criada no MagicCAD.');
  history.commit({ ...history.project, entities: history.project.entities.map(e=> e.id===roomId ? {...room, doors:[...(room.doors??[]),door]} : e) });
}

export function arcPoints(arc) {
  const point=angle=>{const [x,y]=[[1,0],[0,-1],[-1,0],[0,1]][angle/90];return {x:arc.cx+x*arc.radius,y:arc.cy+y*arc.radius};};
  return [point(arc.startAngle),point(arc.endAngle)];
}
export function arcPath(arc) {
  const [a,b]=arcPoints(arc);return `M${a.x},${a.y} A${arc.radius},${arc.radius} 0 0 0 ${b.x},${b.y}`;
}
