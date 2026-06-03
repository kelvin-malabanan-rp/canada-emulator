# Radiant6 Canada POS Emulator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Electron + React + TypeScript app that simulates a Radiant6 Canada register, emitting the exact Virtual Journal (TCP:5438) and Pole Display (TCP:5439) stream that CKPlayer2.0's `radiant6-canada` plugin consumes.

**Architecture:** Three layers like CKPlayer2.0 — `electron/` (Node main process owns the two TCP client sockets), `src/core/` (pure, browser-safe, unit-tested basket model + Radiant6 Canada wire encoder), `src/renderer/` (React UI). Renderer talks to main only through a typed `contextBridge` preload. All money is integer cents.

**Tech Stack:** electron-vite, Electron, React 18, TypeScript (strict), Vitest, Node `net`.

**Reference contract:** `../CKPlayer2.0/electron/plugins/radiant6-canada/` — `Radiant6CanadaMessageParser.ts` (VJ), `Radiant6CanadaPoleDisplayParser.ts` (pole), and their `__tests__/` gold strings. The emulator's output MUST parse cleanly through those.

---

## Task 1: Scaffold the project

**Files:**
- Create: project at `radiant6-canada-emulator/` via `electron-vite` react-ts template
- Modify: `package.json`, `tsconfig.json`, `electron.vite.config.ts`
- Create: `vitest.config.ts`

**Step 1:** Scaffold:
```bash
cd "/Users/dev.kelvin/Documents/Rocket Partners/LIFT"
npm create @quick-start/electron@latest radiant6-canada-emulator -- --template react-ts
cd radiant6-canada-emulator && npm install && npm install -D vitest
```

**Step 2:** Add scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`. Create `vitest.config.ts` with `environment: 'node'` and `include: ['src/**/*.test.ts']`.

**Step 3:** Set `tsconfig` `strict: true`, `noImplicitAny: true`.

**Step 4:** Verify dev boot: `npm run dev` (window opens), then close. Run `npm test` (0 tests, exits 0).

**Step 5:** Commit:
```bash
git init && git add -A && git commit -m "chore: scaffold electron-vite react-ts project"
```

---

## Task 2: Money — integer-cents currency formatting

**Files:**
- Create: `src/core/currency.ts`
- Test: `src/core/currency.test.ts`

**Step 1: Failing test** — match the parser's expected strings:
```ts
import { formatCurrency } from './currency';
describe('formatCurrency', () => {
  it('en-CA: $ prefix, period decimal', () => {
    expect(formatCurrency(194, 'en')).toBe('$1.94');
    expect(formatCurrency(500000, 'en')).toBe('$5,000.00');
  });
  it('fr-CA: $ suffix, comma decimal, U+00A0 thousands', () => {
    expect(formatCurrency(194, 'fr')).toBe('1,94$');
    expect(formatCurrency(500000, 'fr')).toBe('5 000,00$');
  });
});
```

**Step 2:** Run `npx vitest run src/core/currency.test.ts` — expect FAIL.

**Step 3:** Implement `formatCurrency(cents: number, locale: 'en' | 'fr'): string` building from integer cents (no `toFixed` rounding drift; assemble integer + fractional parts, insert thousands separator manually).

**Step 4:** Run test — expect PASS.

**Step 5:** Commit `feat(core): add en/fr currency formatter`.

---

## Task 3: Basket model

**Files:**
- Create: `src/core/Basket.ts`
- Test: `src/core/Basket.test.ts`

**Step 1: Failing tests** covering: add item (line number increments), void item (excluded from totals), set quantity, set price override, subtotal/tax/total in cents, CAD cash rounding to nearest 5 cents (`roundCashTotal`), `changeDue(tenderedCents)`.
```ts
const b = new Basket({ taxRateBps: 500 }); // 5%
b.addItem({ code: '049000000443', description: 'Coke', priceCents: 169 });
expect(b.subtotalCents()).toBe(169);
expect(b.totalCents()).toBe(177);            // 169 + 5% rounded
expect(b.roundCashTotal()).toBe(175);        // nearest 0.05
```

**Step 2:** Run — FAIL.

**Step 3:** Implement `Basket` with `LineItem[]`, derived getters, `roundCashTotal` (`Math.round(total/5)*5`), `nextDollar`/`exactDollar` helpers. Integer cents throughout.

**Step 4:** Run — PASS.

**Step 5:** Commit `feat(core): add Basket model with CAD cash rounding`.

---

## Task 4: Encoder — VJ session events (1001 / 1009 / 1002)

**Files:**
- Create: `src/core/Radiant6CanadaEncoder.ts`
- Test: `src/core/Radiant6CanadaEncoder.test.ts`

**Step 1: Failing tests** asserting exact lines (terminated `\r\n`), cross-checked against `Radiant6CanadaMessageParser.test.ts`:
```ts
const enc = new Radiant6CanadaEncoder({ terminalNumber: 1 });
expect(enc.registerOpen({ tx: 1, operatorId: '42', operatorName: 'Joe' }))
  .toMatch(/^EventId=1001,TerminalNumber=1,EventTime=.+,TransactionNumber=1,OperatorId=42,OperatorName=Joe\r\n$/);
expect(enc.basketStarted({ tx: 1 })).toContain('EventId=1009');
expect(enc.basketEnd({ tx: 1, type: 'Sales', completion: 'Completed' }))
  .toContain('TransactionType=Sales,TransactionCompletionType=Completed');
```

**Step 2:** Run — FAIL.

**Step 3:** Implement an `eventLine(eventId, fields)` helper (formats `EventId=..,TerminalNumber=..,EventTime=<yyyy-MM-ddTHH:mm:ss.SSS>,..\r\n`) and `registerOpen`/`basketStarted`/`basketEnd`. **Never** emit 1005/1020.

**Step 4:** Run — PASS.

**Step 5:** Commit `feat(core): encode VJ session events (1001/1009/1002)`.

---

## Task 5: Encoder — item lifecycle VJ events (1011 / 1012 / 1013 / 1014)

**Files:**
- Modify: `src/core/Radiant6CanadaEncoder.ts`
- Test: `src/core/Radiant6CanadaEncoder.test.ts`

**Step 1: Failing tests** for `itemAdd` (ItemNumber, Barcode, Description, ExtendedPrice, Quantity, ItemType=Regular Sales Item), `itemVoid` (ItemNumber), `priceOverride` (NewUnitPrice), `qtyChange` (OldQuantity/NewQuantity/ExtendedPrice). Verify each parses via the CKPlayer2.0 parser if vendored (see Task 10), else assert exact substrings.

**Step 2:** Run — FAIL. **Step 3:** Implement the four methods. **Step 4:** PASS. **Step 5:** Commit `feat(core): encode item lifecycle VJ events`.

---

## Task 6: Encoder — pole display windows (20-char, EN + FR)

**Files:**
- Modify: `src/core/Radiant6CanadaEncoder.ts`
- Test: `src/core/Radiant6CanadaEncoder.test.ts`

**Step 1: Failing tests** — output must contain exactly-20-char printable windows the pole parser matches:
```ts
expect(enc.poleBalance(194, 'en')).toContain('Balance Due    $1.94'); // 20 chars
expect(enc.poleChange(6, 'en')).toContain('Change Due     $0.06');
expect(enc.poleBalance(194, 'fr')).toMatch(/Solde d.:.{11}/);
expect(enc.poleChange(6, 'fr')).toContain('Monnaie due:');
expect(enc.poleItem(1, 'Coke', 194, 'en')).toMatch(/^1\s+Coke\s+\$1\.94$/);
```

**Step 2:** Run — FAIL.

**Step 3:** Implement pole builders that left-justify the label and right-justify the formatted amount into a fixed 20-char field (EN labels `Balance Due`/`Change Due`; FR `Solde dû:`/`Monnaie due:` — emit `dû` so the player's `û→space` path applies). Pad/trim to width.

**Step 4:** Run — PASS. **Step 5:** Commit `feat(core): encode bilingual 20-char pole windows`.

---

## Task 7: Encoder — Arrondir 1022 + EasyPay 1024

**Files:**
- Modify: `src/core/Radiant6CanadaEncoder.ts`
- Test: `src/core/Radiant6CanadaEncoder.test.ts`

**Step 1: Failing tests:**
```ts
expect(enc.rounding({ tx: 9, amountCents: 2 }))
  .toMatch(/EventId=1022,.*Description=Arrondir/);
expect(enc.loyalty({ tx: 9, cardId: '70000000001', cardNumber: '8018782603800034999992' }))
  .toMatch(/EventId=1024,.*DiscountCardId=70000000001,DiscountCardNumber=8018782603800034999992\r\n$/);
expect(enc.loyalty({ tx: 9, cardNumber: '049000000443' })) // 12-digit UPC path
  .toContain('DiscountCardNumber=049000000443');
```

**Step 2:** Run — FAIL. **Step 3:** Implement `rounding` (Description=Arrondir/Rounding) and `loyalty` (1024). **Step 4:** PASS. **Step 5:** Commit `feat(core): encode Arrondir 1022 and EasyPay 1024`.

---

## Task 8: TCP transport (Electron main)

**Files:**
- Create: `src/main/PosTransport.ts`
- Test: `src/main/PosTransport.test.ts`

**Step 1: Failing test** — using a throwaway `net.createServer` on an ephemeral port, assert `PosTransport.send(channel, data)` is received byte-for-byte and `status` reports `connected`. Cover auto-reconnect after server restart.

**Step 2:** Run — FAIL.

**Step 3:** Implement `PosTransport` wrapping two `net.Socket` clients (vj + pole) with configurable host/port, `connect()`, `send(channel, bytes)`, exponential-backoff reconnect, and a status emitter.

**Step 4:** Run — PASS. **Step 5:** Commit `feat(main): TCP client transport with reconnect`.

---

## Task 9: IPC bridge (preload + main handlers)

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`

**Step 1:** Wire `ipcMain.handle('emulator:connect'|'emulator:sendVJ'|'emulator:sendPole')` to `PosTransport`; expose `window.emulator` via `contextBridge` with typed methods + `onStatus` callback. (No business logic in main/preload.)

**Step 2:** Typecheck: `npm run build` (or `tsc --noEmit`) — expect clean.

**Step 3:** Commit `feat: typed IPC bridge for emulator transport`.

---

## Task 10 (stretch): Round-trip test against the real parser

**Files:**
- Create: `src/core/__roundtrip__/parser-roundtrip.test.ts`

**Step 1:** Import (or vendor a copy of) `Radiant6CanadaMessageParser` and `Radiant6CanadaPoleDisplayParser` from `../CKPlayer2.0/...`. Feed encoder output through them; assert the expected `RegisterEvent` actions/values (e.g. `poleBalance(194,'en')` → `POLEDISP_TOTAL` `totalCents:194`; `loyalty(...)` → `LOYALTY_OR_UPC_SCANNED`).

**Step 2:** Run — iterate encoder until green. **Step 3:** Commit `test: round-trip encoder output through CKPlayer2.0 parsers`.

---

## Task 11: React UI

**Files:**
- Modify: `src/renderer/src/App.tsx`; Create components under `src/renderer/src/components/`
- Create: `src/renderer/src/useEmulator.ts` (hook bridging UI ↔ Basket/Encoder/IPC)

**Step 1:** Build UI: connection bar (host/ports, status), item grid/quick-keys + scan box, selected-line controls (void / qty / price), tender buttons (cash / exact / next-dollar), loyalty-scan field (UPC vs loyalty), **en-CA ⇄ fr-CA toggle**, and a live wire-log panel showing every emitted VJ line / pole frame.

**Step 2:** Each user action: update `Basket` → call `Radiant6CanadaEncoder` → `window.emulator.sendVJ/sendPole`. Keep all logic in `useEmulator.ts`/core; components stay presentational.

**Step 3:** Manual verify with `npm run dev`. Typecheck clean.

**Step 4:** Commit `feat(ui): register emulator UI with bilingual toggle and wire log`.

---

## Task 12: End-to-end verification against CKPlayer2.0

**Step 1:** Configure a CKPlayer2.0 CA settinggroup with `virtualjournal.ioParams=TCP:5438`, `poledisp.ioParams=TCP:5439`; start CKPlayer2.0.

**Step 2:** Launch the emulator, connect, run a transaction (open → add items → loyalty scan → tender cash). Confirm CKPlayer2.0 logs `[Radiant6CanadaPole]` / VJ events and the basket/loyalty state updates.

**Step 3:** Document run steps in `README.md`. Commit `docs: add run/verify instructions`.

---

## Notes for the executor
- DRY/YAGNI/TDD; commit after each green task.
- `src/core/` and `src/renderer/` must NOT import Node/Electron APIs.
- Money is always integer cents; never `toFixed(2)` for math.
- Never emit VJ `EventId=1005` or `1020` (CA suppresses them).
- Cross-check every wire string against `../CKPlayer2.0/electron/plugins/radiant6-canada/__tests__/`.
