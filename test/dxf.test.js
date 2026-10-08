import test from 'node:test';
import assert from 'node:assert/strict';
import { projectToDxf, dxfToProject } from '../src/dxf.js';
import { History } from '../src/core.js';
test('DXF mantém coordenadas exatas, unidades e contornos interiores/exteriores', () => {
  const h = new History(); h.add({ id: 'r', type: 'room', name: 'Sala', x: 0, y: 0, width: 4000, height: 5000, thickness: 200 });
  const text = projectToDxf(h.project), p = dxfToProject(text);
  assert.equal(p.units, 'mm'); assert.equal(p.entities.length, 8);
  assert.deepEqual(p.entities[0], { id: 'dwg-1', type: 'line', x1: 0, y1: 0, x2: 4000, y2: 0, layer: 'PAREDES' });
  assert.equal(Math.min(...p.entities.flatMap(e => [e.x1, e.x2])), -200);
  assert.equal(Math.max(...p.entities.flatMap(e => [e.y1, e.y2])), 5200);
});
test('DXF sem unidades, com objetos não suportados ou geometria 3D é recusado', () => {
  const h = new History(); h.add({ id: 'l', type: 'line', x1: 0, y1: 0, x2: 1000, y2: 2000 });
  const text = projectToDxf(h.project);
  assert.throws(() => dxfToProject(text.replace('$INSUNITS', '$OTHER')), /unidades/);
  assert.throws(() => dxfToProject(text.replace('\nLINE\n', '\nCIRCLE\n')), /CIRCLE/);
  assert.throws(() => dxfToProject(text.replace('11\n1000\n', '31\n1\n11\n1000\n')), /3D/);
});
test('escalas declaradas são convertidas e precisão incompatível é recusada', () => {
  const h = new History(); h.add({ id: 'l', type: 'line', x1: 0, y1: 0, x2: 1, y2: 2 });
  const text = projectToDxf(h.project);
  assert.equal(dxfToProject(text.replace('$INSUNITS\n70\n4', '$INSUNITS\n70\n6')).entities[0].x2, 1000);
  const start = text.indexOf('ENTITIES');
  const invalid = text.slice(0, start) + text.slice(start).replace('11\n1\n', '11\n1.1\n');
  assert.notEqual(invalid, text);
  assert.throws(() => dxfToProject(invalid), /precisão/);
});
test('DXF preserva arco verdadeiro e medidas da porta; recusa outros ângulos', async () => {
 const {insertDoor,doorGeometry}=await import('../src/core.js');
 const h=new History();h.add({id:'r',type:'room',name:'Sala',x:0,y:0,width:4000,height:5000,thickness:200});
 insertDoor(h,'r',{wall:'south',width:900,offset:1000,hinge:'end',leafThickness:45,frameWidth:35});
 const text=projectToDxf(h.project),p=dxfToProject(text),actual=p.entities.find(e=>e.type==='arc'),expected=doorGeometry(h.project.entities[0],h.project.entities[0].doors[0]).arc;
 assert.deepEqual({...actual,id:'door-arc'},expected);assert.equal(p.entities.filter(e=>e.type==='line').length,26);
 const single=new History();single.add(expected);const singleDxf=projectToDxf(single.project);
 assert.throws(()=>dxfToProject(singleDxf.replace(`50\n${expected.startAngle}\n`,'50\n45\n')),/arcos/);
});
