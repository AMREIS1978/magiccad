const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1000, minHeight: 650, backgroundColor: '#101c23', title: 'MagicCAD', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
ipcMain.handle('project:save', async (event, data) => {
  if (event.sender !== win.webContents) throw new Error('Pedido inválido.');
  const { validateProject } = await import('./core.js');
  const project = validateProject(data);
  const choice = await dialog.showSaveDialog(win, { defaultPath: 'projeto.magiccad.json', filters: [{ name: 'Projeto MagicCAD', extensions: ['magiccad.json'] }] });
  if (choice.canceled) return null;
  // Exclusive temporary creation and rename avoid leaving a half-written project.
  const temporary = `${choice.filePath}.${require('node:crypto').randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(project, null, 2), { flag: 'wx' }); await fs.rename(temporary, choice.filePath); }
  finally { await fs.rm(temporary, { force: true }); }
  return path.basename(choice.filePath);
});
ipcMain.handle('project:open', async event => {
  if (event.sender !== win.webContents) throw new Error('Pedido inválido.');
  const choice = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Projeto MagicCAD', extensions: ['magiccad.json'] }] });
  if (choice.canceled) return null;
  const file = await fs.open(choice.filePaths[0], 'r');
  try {
    if ((await file.stat()).size > 10_000_000) throw new Error('O ficheiro excede o limite de 10 MB.');
    const { validateProject } = await import('./core.js');
    return { name: path.basename(choice.filePaths[0]), project: validateProject(JSON.parse(await file.readFile('utf8'))) };
  } finally { await file.close(); }
});
function libreDwgDirectory() {
  return process.env.LIBREDWG_BIN || (process.platform === 'win32' ? path.join(app.getAppPath(), 'tools', 'libredwg') : '/workspace/.tools/libredwg-build');
}
ipcMain.handle('dwg:export', async (event, data) => {
  if (event.sender !== win.webContents) throw new Error('Pedido inválido.');
  const choice = await dialog.showSaveDialog(win, { defaultPath: 'planta.dwg', filters: [{ name: 'DWG R2000 · geometria 2D', extensions: ['dwg'] }] });
  if (choice.canceled) return null;
  const { exportDwg } = await import('./dwg.js');
  await exportDwg(data, choice.filePath, libreDwgDirectory());
  return path.basename(choice.filePath);
});
ipcMain.handle('dwg:import', async event => {
  if (event.sender !== win.webContents) throw new Error('Pedido inválido.');
  const choice = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'DWG · linhas, polilinhas e arcos de 90°', extensions: ['dwg'] }] });
  if (choice.canceled) return null;
  const { importDwg } = await import('./dwg.js');
  return { name: path.basename(choice.filePaths[0]), project: await importDwg(choice.filePaths[0], libreDwgDirectory()) };
});
