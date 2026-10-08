import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, copyFile, stat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { constants } from 'node:fs';
import { projectToDxf, dxfToProject } from './dxf.js';
const execFile = promisify(execFileCallback);
function binary(name, directory) { return join(directory, name + (process.platform === 'win32' ? '.exe' : '')); }
async function run(name, args, directory) {
  try {
    const { stderr } = await execFile(binary(name, directory), args, { timeout: 30000, maxBuffer: 8_000_000, windowsHide: true });
    if (/ERROR:|unknown entity|unsupported entity|skipp(?:ed|ing)/i.test(stderr)) throw new Error(stderr.slice(-1500));
  }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('LibreDWG não está instalado. Execute o script de preparação e indique LIBREDWG_BIN.');
    throw new Error(`O LibreDWG não concluiu a conversão (${name}). ${String(error.stderr ?? error.message).slice(-1500)}`);
  }
}
export async function exportDwg(project, destination, directory) {
  const temporary = await mkdtemp(join(tmpdir(), 'magiccad-'));
  try {
    const input = join(temporary, 'project.lines'), output = join(temporary, 'project.dwg');
    const flattened = dxfToProject(projectToDxf(project));
    await writeFile(input, flattened.entities.map(e => e.type==='arc' ? `A ${e.cx} ${-e.cy} ${e.radius} ${e.startAngle} ${e.endAngle} ${e.layer}\n` : `L ${e.x1} ${-e.y1} ${e.x2} ${-e.y2} ${e.layer}\n`).join(''));
    await run('magiccad-dwg-write', [input, output], directory);
    const bytes = await readFile(output);
    if (bytes.subarray(0, 6).toString() !== 'AC1015') throw new Error('A conversão não produziu DWG R2000.');
    // Read our own output before touching the destination.
    await run('dwg2dxf', ['-o', join(temporary, 'check.dxf'), output], directory);
    const expected = dxfToProject(projectToDxf(project));
    const actual = dxfToProject(await readFile(join(temporary, 'check.dxf'), 'utf8'));
    const canonical = p => p.entities.map(e => JSON.stringify(e.type==='arc'?{type:'arc',cx:e.cx,cy:e.cy,radius:e.radius,startAngle:e.startAngle,endAngle:e.endAngle,layer:e.layer}:{ points: [[e.x1,e.y1],[e.x2,e.y2]].sort((a,b) => a[0]-b[0] || a[1]-b[1]), layer: e.layer })).sort();
    if (JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(actual))) throw new Error('A releitura do DWG não preservou a geometria e as camadas. O destino não foi alterado.');
    // The native dialog confirms overwrites; replace the destination only after successful validation.
    const sibling = `${destination}.${randomUUID()}.tmp`;
    try {
      await copyFile(output, sibling, constants.COPYFILE_EXCL);
      await rename(sibling, destination);
    } finally { await rm(sibling, { force: true }); }
    return { entities: project.entities.length, version: 'R2000' };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export async function importDwg(source, directory) {
  if ((await stat(source)).size > 10_000_000) throw new Error('O DWG excede o limite de 10 MB desta versão.');
  const signature = (await readFile(source)).subarray(0, 6).toString();
  if (!/^AC10\d\d$/.test(signature)) throw new Error('O ficheiro não tem uma assinatura DWG suportada.');
  const temporary = await mkdtemp(join(tmpdir(), 'magiccad-'));
  try {
    const input = join(temporary, 'input.dwg'), output = join(temporary, 'input.dxf');
    await copyFile(source, input, constants.COPYFILE_EXCL);
    await run('dwg2dxf', ['-o', output, input], directory);
    return dxfToProject(await readFile(output, 'utf8'));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
