import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type { Channel, PosConfig, Status, EmulatorBridge } from '../core/posTypes';

/** The typed emulator bridge exposed to the renderer as `window.emulator`. */
const emulator: EmulatorBridge = {
  connect: (config: PosConfig): Promise<Status> => ipcRenderer.invoke('emulator:connect', config),
  disconnect: (): Promise<Status> => ipcRenderer.invoke('emulator:disconnect'),
  send: (channel: Channel, data: string): Promise<boolean> =>
    ipcRenderer.invoke('emulator:send', { channel, data }),
  getStatus: (): Promise<Status> => ipcRenderer.invoke('emulator:status'),
  onStatus: (cb: (status: Status) => void): (() => void) => {
    const handler = (_evt: unknown, status: Status): void => cb(status);
    ipcRenderer.on('emulator:status-changed', handler);
    return () => ipcRenderer.removeListener('emulator:status-changed', handler);
  },
  loadPricebook: (req: { dir: string; playerCode: string }) => ipcRenderer.invoke('pricebook:load', req),
  registerPlayer: (req: { playerKey: string; product?: string }) => ipcRenderer.invoke('globalinit:register', req),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('emulator', emulator);
  } catch (error) {
    console.error('[preload] exposeInMainWorld failed', error);
  }
} else {
  // @ts-ignore (defined in index.d.ts)
  window.electron = electronAPI;
  // @ts-ignore (defined in index.d.ts)
  window.emulator = emulator;
}
