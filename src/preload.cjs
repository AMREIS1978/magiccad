const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('magiccad', {
  save: project => ipcRenderer.invoke('project:save', project),
  open: () => ipcRenderer.invoke('project:open'),
  exportDwg: project => ipcRenderer.invoke('dwg:export', project),
  importDwg: () => ipcRenderer.invoke('dwg:import')
});
