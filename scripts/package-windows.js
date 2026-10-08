import packager from '@electron/packager';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('..', import.meta.url));
for (const name of ['dwg2dxf.exe', 'magiccad-dwg-write.exe', 'COPYING.libredwg']) {
  try { await access(new URL(`../tools/libredwg/${name}`, import.meta.url)); }
  catch { throw new Error(`Missing ${name}. Run scripts/setup-windows.ps1 on Windows before packaging.`); }
}
const paths = await packager({ dir: directory, name: 'MagicCAD', platform: 'win32', arch: 'x64', out: 'dist', overwrite: true, asar: false, ignore: [/^\/test(?:\/|$)/, /^\/dist(?:\/|$)/, /^\/tools\/(?:libredwg-source|libredwg-build|magiccad-native)(?:\/|$)/] });
console.log(paths.join('\n'));
