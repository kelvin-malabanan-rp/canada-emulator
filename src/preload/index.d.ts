import { ElectronAPI } from '@electron-toolkit/preload';
import type { EmulatorBridge } from '../core/posTypes';

declare global {
  interface Window {
    electron: ElectronAPI;
    emulator: EmulatorBridge;
  }
}
