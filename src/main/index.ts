import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { networkInterfaces } from 'os';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { PosTransport } from './PosTransport';
import type { Channel, Status } from './PosTransport';
import type { PosConfig } from '../core/posTypes';
import { parsePricebook, resolvePricebookFilename } from '../core/pricebook';
import type { PricebookLoadResult } from '../core/pricebook';
import { DATACENTERS, toGlobalInitConfig } from '../core/globalInit';
import type { GlobalInitResult } from '../core/globalInit';

/** First non-internal MAC address (matches the player's GlobalInit param). */
function getMacAddress(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') return iface.mac;
    }
  }
  return '00:00:00:00:00:00';
}

async function fetchDatacenterConfig(
  register: string,
  name: string,
  playerKey: string,
  product: string,
  mac: string,
): Promise<GlobalInitResult['config'] | null> {
  const url = new URL(register);
  url.searchParams.set('product', product);
  url.searchParams.set('initKey', playerKey);
  url.searchParams.set('macAddress', mac);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    console.log(`[GlobalInit] → ${name}: GET ${register} (initKey=${playerKey.slice(0, 8)}…, mac=${mac})`);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'CK-Player-2.0/1.0' } });
    console.log(`[GlobalInit]   ${name}: HTTP ${res.status}`);
    if (!res.ok) return null;
    const config = toGlobalInitConfig(await res.text(), name);
    if (config) {
      console.log(`[GlobalInit] ✅ ${name}: player.code=${config.playerCode} tenant=${config.tenant}`);
    } else {
      console.log(`[GlobalInit]   ${name}: 200 but no player.code in response`);
    }
    return config ?? null;
  } catch (err) {
    console.warn(`[GlobalInit]   ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
      console.log(`[Pricebook] Loading for player code "${playerCode}" from ${dir}`);
      try {
        const files = await readdir(dir);
        const filename = resolvePricebookFilename(files, playerCode);
        console.log(`[Pricebook]   matched file: ${filename ?? '(none)'}`);
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
        console.log(`[Pricebook]   parsed ${entries.length} items from ${filename}`);
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

  // GlobalInit: send the player.key to each datacenter's services/init and
  // return the first generated config (player.code + tenant endpoint URLs).
  // Mirrors CKPlayer2.0 GlobalInitClient + the legacy Java player.
  ipcMain.handle(
    'globalinit:register',
    async (_evt, req: { playerKey: string; product?: string }): Promise<GlobalInitResult> => {
      const playerKey = req.playerKey?.trim();
      if (!playerKey) return { ok: false, error: 'No player.key provided' };
      const product = req.product?.trim() || 'ckplayer2';
      const mac = getMacAddress();
      console.log(`[GlobalInit] Registering player.key=${playerKey.slice(0, 8)}… across ${DATACENTERS.length} datacenters (product=${product})`);
      try {
        const results = await Promise.allSettled(
          DATACENTERS.map((dc) => fetchDatacenterConfig(dc.register, dc.name, playerKey, product, mac)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            console.log(`[GlobalInit] Done — registered as ${r.value.playerCode} on ${r.value.datacenter}`);
            return { ok: true, config: r.value };
          }
        }
        console.warn('[GlobalInit] Not registered on any datacenter');
        return { ok: false, error: 'player.key not registered on any datacenter (or network unreachable)' };
      } catch (err) {
        console.error('[GlobalInit] register failed:', err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
