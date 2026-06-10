import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    // Use a dedicated dev-server port so the emulator never collides with
    // CK Player 2.0's Vite server (port 5173, strictPort). Without this, both
    // default to 5173 — whichever starts first wins, and CK Player 2.0 (which
    // requires 5173) fails to bind and renders a blank/white screen.
    server: { port: 5273, strictPort: true },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
});
