import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { PosTransport } from './PosTransport';
import type { Channel, Status } from './PosTransport';
import type { PosConfig } from '../core/posTypes';
import { parsePricebook, resolvePricebookFilename } from '../core/pricebook';
import type { PricebookLoadResult } from '../core/pricebook';

let transport: PosTransport | null = null;

function registerEmulatorIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('emulator:connect', async (_evt, config: PosConfig) => {
    transport?.close();
    transport = new PosTransport(config);
    transport.onStatus((status: Status) => {
      getWindow()?.webContents.send('emulator:status-changed', status);
    });
    await transport.connect();
    return transport.status();
  });

  ipcMain.handle('emulator:disconnect', () => {
    transport?.close();
    transport = null;
    return { vj: 'disconnected', pole: 'disconnected' } satisfies Status;
  });

  ipcMain.handle('emulator:send', (_evt, payload: { channel: Channel; data: string }) => {
    return transport?.send(payload.channel, payload.data) ?? false;
  });

  ipcMain.handle('emulator:status', () => {
    return transport?.status() ?? ({ vj: 'disconnected', pole: 'disconnected' } satisfies Status);
  });

  // Load the OCT2000 pricebook that corresponds to the player code in use:
  // Circle K names exports `<siteCode>-<timestamp>.xml`, so we pick the match.
  ipcMain.handle(
    'pricebook:load',
    async (_evt, req: { dir: string; playerCode: string }): Promise<PricebookLoadResult> => {
      const { dir, playerCode } = req;
      try {
        const files = await readdir(dir);
        const filename = resolvePricebookFilename(files, playerCode);
        if (!filename) {
          return {
            ok: false,
            count: 0,
            entries: [],
            path: dir,
            error: `No pricebook matching player code "${playerCode}" in ${dir}`,
          };
        }
        const full = join(dir, filename);
        const xml = await readFile(full, 'utf-8');
        const entries = parsePricebook(xml);
        return { ok: true, count: entries.length, entries, path: full };
      } catch (err) {
        return {
          ok: false,
          count: 0,
          entries: [],
          path: dir,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  win.on('ready-to-show', () => {
    win.show();
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow = win;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.rocketpartners.radiant6-canada-emulator');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerEmulatorIpc(() => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
