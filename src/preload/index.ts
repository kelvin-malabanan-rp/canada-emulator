import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// The typed emulator bridge (connect/sendVJ/sendPole/onStatus) is added in
// the IPC task. For now expose the base electron toolkit API only.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
}
