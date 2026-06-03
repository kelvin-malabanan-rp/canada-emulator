# Radiant6 Canada POS Emulator

A standalone **Electron + React + TypeScript** desktop app that simulates a
Radiant6 Canada register and emits the exact Virtual Journal + Pole Display
stream that **CK Player 2.0**'s `radiant6-canada` plugin consumes. Use it to
drive and test the player without physical Canadian POS hardware.

It replaces the empty `Radiant6CanadaRegisterEmulator` stub in the legacy
`liftck_player` emulator module.

## What it emits

- **Virtual Journal** (TCP, default `127.0.0.1:5438`) — `EventId=…` lines:
  1001 register open, 1009 basket start, 1011 item add, 1012 void, 1013 price
  override, 1014 qty change, 1007 tender, 1008 change, 1022 **Arrondir**
  rounding, 1024 **EasyPay/loyalty**, 1002 basket end.
- **Pole Display** (TCP, default `127.0.0.1:5439`) — 20-char windows for
  balance / change / item lines, in **en-CA and fr-CA**.

Canada rules honoured: tax/balance are **pole-authoritative** (the VJ never
emits `1005`/`1020`); cash rounds to the nearest 5¢ and emits `Arrondir`;
fr-CA balance uses the legacy `dû` → `U+FFFD` → space substitution.

## Run

```bash
npm install
npm run dev      # launch the emulator (Electron)
npm test         # 44 unit + round-trip tests
npm run build    # typecheck + production build
```

## Verify against CK Player 2.0

1. Configure a CK Player 2.0 Canada settinggroup:
   ```
   virtualjournal.className=plugins/radiant6-canada/Radiant6CanadaVirtualJournal
   virtualjournal.ioParams=TCP:5438
   poledisp.className=plugins/radiant6-canada/Radiant6CanadaPoleDisplay
   poledisp.ioParams=TCP:5439
   ```
2. Start CK Player 2.0 (it listens on 5438/5439).
3. Launch this emulator, set the host/ports in the top bar, click **Connect**
   (both dots turn green).
4. Tap quick keys, scan a card, tender cash. Watch the **Wire Log** panel and
   confirm CK Player 2.0 logs `[Radiant6CanadaPole]` / VJ events and updates the
   basket / loyalty state.

> The `parser-roundtrip` test imports CK Player 2.0's **real** parsers from the
> sibling repo and asserts the emulator's output decodes to the expected
> `RegisterEvent`s — the automated proof of compatibility.

## Architecture

- `electron/` (main) — `PosTransport`: two TCP client sockets + auto-reconnect.
- `src/core/` — pure, browser-safe, fully unit-tested: `currency`, `Basket`,
  `Radiant6CanadaEncoder`, `RegisterSession`, `posTypes`.
- `src/renderer/` — React UI (`useEmulator` hook over `RegisterSession`).
- `src/preload/` — typed `window.emulator` bridge.

Plan and design: `docs/plans/`.
