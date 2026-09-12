import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  dataset: {
    list: () => ipcRenderer.invoke('dataset:list'),
    create: (n: string, d: string, t: string, g: string) =>
      ipcRenderer.invoke('dataset:create', n, d, t, g),
    update: (id: number, n: string, d: string, t: string, g: string) =>
      ipcRenderer.invoke('dataset:update', id, n, d, t, g),
    delete: (id: number) => ipcRenderer.invoke('dataset:delete', id)
  },
  image: {
    upload: (did: number) => ipcRenderer.invoke('image:upload', did),
    list: (did: number) => ipcRenderer.invoke('image:list', did),
    listWithStatus: (did: number) => ipcRenderer.invoke('image:list-with-status', did),
    getPath: (iid: number) => ipcRenderer.invoke('image:get-path', iid),
    getUrl: (iid: number) => ipcRenderer.invoke('image:get-url', iid),
    delete: (id: number) => ipcRenderer.invoke('image:delete', id)
  },
  annotation: {
    get: (iid: number) => ipcRenderer.invoke('annotation:get', iid),
    save: (iid: number, shapes: string, meta: string) =>
      ipcRenderer.invoke('annotation:save', iid, shapes, meta),
    skip: (iid: number) => ipcRenderer.invoke('annotation:skip', iid),
    export: (did: number, format: string) => ipcRenderer.invoke('annotation:export', did, format)
  },
  setShortcutState: (state: any) => ipcRenderer.send('shortcut-state:change', state),
  setShortcutBindings: (bindings: Record<string, string>) =>
    ipcRenderer.send('shortcut-bindings:change', bindings),
  onPageChange: (page: string) => ipcRenderer.send('page:change', page)
})
