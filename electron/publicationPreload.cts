import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('publication',{document:()=>ipcRenderer.invoke('publication:document'),export:(format:unknown)=>ipcRenderer.invoke('publication:export',format),close:()=>ipcRenderer.send('publication:close')});
