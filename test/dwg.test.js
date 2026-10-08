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
test('DWG com porta preserva o vão, ombreiras e folha a 90 graus', async () => {
 const {insertDoor,roomSegments,doorGeometry}=await import('../src/core.js');
 const temp=await mkdtemp(join(tmpdir(),'magiccad-door-'));
 try {
  const h=new History();h.add({id:'r',type:'room',name:'Sala',x:1250,y:-500,width:4000,height:5000,thickness:200});
  insertDoor(h,'r',{wall:'north',width:900,offset:1000,hinge:'start'});
  const path=join(temp,'door.dwg');await exportDwg(h.project,path,binaries);const restored=await importDwg(path,binaries);
  const canonical=items=>items.map(([a,b])=>[[a.x,a.y],[b.x,b.y]].sort((p,q)=>p[0]-q[0]||p[1]-q[1])).map(v=>JSON.stringify(v)).sort();
  assert.deepEqual(canonical(restored.entities.filter(e=>e.type==='line').map(e=>[{x:e.x1,y:e.y1},{x:e.x2,y:e.y2}])),canonical(roomSegments(h.project.entities[0])));
  assert.equal(restored.entities.length,27);
  const actual=restored.entities.find(e=>e.type==='arc'),expected=doorGeometry(h.project.entities[0],h.project.entities[0].doors[0]).arc;
  assert.deepEqual({...actual,id:'door-arc'},expected);
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('DWG preserva arcos e molduras nas oito combinações de parede e dobradiça', async () => {
 const {insertDoor,doorGeometry}=await import('../src/core.js');const temp=await mkdtemp(join(tmpdir(),'magiccad-swings-'));
 try {
  for(const wall of ['north','south','east','west']) for(const hinge of ['start','end']) {
   const h=new History();h.add({id:'r',type:'room',name:'Sala',x:1250,y:-500,width:4000,height:5000,thickness:200});
   insertDoor(h,'r',{wall,width:900,offset:1000,hinge,leafThickness:45,frameWidth:35});
   const file=join(temp,`${wall}-${hinge}.dwg`);await exportDwg(h.project,file,binaries);const p=await importDwg(file,binaries);
   assert.deepEqual({...p.entities.find(e=>e.type==='arc'),id:'door-arc'},doorGeometry(h.project.entities[0],h.project.entities[0].doors[0]).arc);
   assert.equal(p.entities.filter(e=>e.type==='line').length,26);
  }
 }finally{await rm(temp,{recursive:true,force:true});}
});
