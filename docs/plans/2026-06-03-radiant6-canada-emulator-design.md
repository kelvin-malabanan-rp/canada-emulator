# Radiant6 Canada POS Emulator — Design

Date: 2026-06-03
Status: Approved

## Purpose

A standalone **Electron + React + TypeScript** desktop app that simulates a
Radiant6 Canada register, emitting the exact Canada POS stream that CKPlayer2.0's
`radiant6-canada` plugin consumes — so developers can drive/test the player
without physical Canadian hardware. Replaces the empty 9-line
`Radiant6CanadaRegisterEmulator` stub in legacy `liftck_player` with a modern,
self-contained tool.

## Transport contract (derived from CKPlayer2.0)

CKPlayer2.0's CA adapters listen as **TCP servers**:

- `virtualjournal.ioParams = TCP:5438` — newline-terminated `key=value,...` event
  lines, each starting with `EventId=`.
- `poledisp.ioParams = TCP:5439` — raw bytes drained by the player in **20-char
  printable-ASCII windows**.

The emulator connects as a **TCP client** to both (server mode is used when no
host is configured in `IODeviceFactory.parseTCP`). Default `127.0.0.1:5438` /
`:5439`, configurable.

### Virtual Journal events emitted (CA-relevant)

| EventId | Meaning | Key fields |
|---------|---------|------------|
| 1001 | Register Open | OperatorId, OperatorName (cashier recognition) |
| 1009 | Basket Started | TransactionType=Sales |
| 1011 | Item Add | ItemNumber, Barcode, Description, ExtendedPrice, Quantity, ItemType |
| 1012 | Item Void | ItemNumber |
| 1013 | Price Override | ItemNumber, NewUnitPrice |
| 1014 | Qty Change | ItemNumber, OldQuantity, NewQuantity, ExtendedPrice |
| 1007 | Tender (or Coupon if MOPDescription~coupon) | Amount, MOPDescription |
| 1008 | Change | Amount |
| 1002 | Basket End / Void | TransactionType, TransactionCompletionType |
| 1022 | Rounding ("Arrondir"/"Rounding") or discount void | Description, Amount |
| 1024 | EasyPay / Loyalty | DiscountCardId, DiscountCardNumber |

**Deliberately NOT emitted:** `EventId=1005` (subtotal) and `EventId=1020` (tax) —
suppressed in CA; the pole display is authoritative for tax/balance.

### Pole display windows (20-char printable)

| Pattern | Example (20 chars) | Parsed as |
|---------|--------------------|-----------|
| `Balance Due` + 9 | `Balance Due    $1.94` | total (en-CA) |
| `Solde d.:` + 11 | `Solde dû:    1,94$  ` | total (fr-CA) |
| `Change Due` + 10 | `Change Due     $0.06` | change (en-CA) |
| `Monnaie due:` + 8 | `Monnaie due: 0,06$  ` | change (fr-CA) |
| `^(\d+)\s+desc\s+\$#.##$` | `1 Coke         $1.94` | item (en-CA) |

Quirks reproduced: `û` → `�` → space substitution; keepalive markers
(U+00FF+NUL, U+FFFD+NUL) are noise. Note (documented parser limitation): fr-CA
product lines do not match the player's product regex; balance/change still parse.

## Architecture (3 layers, mirrors CKPlayer2.0)

- **`electron/` (main, Node only):** `PosTransport` — two `net.Socket` clients with
  status + auto-reconnect/backoff. Receives "send bytes" over IPC. No business logic.
- **`src/core/` (pure TS, browser-safe, fully unit-tested):**
  - `Basket` — line items, qty, price, discounts, derived subtotal/tax/total in
    integer cents (no floats).
  - `Radiant6CanadaEncoder` — pure functions producing exact VJ lines + 20-char
    pole windows. The heart of the app; tested against gold strings reused from
    CKPlayer2.0's parser tests.
  - `currency` helpers for en-CA / fr-CA formatting (comma decimal, `$` suffix,
    U+00A0 thousands separator in fr-CA).
- **`src/renderer/` (React UI):** item grid/quick-keys, scan box, qty/void/price
  controls, tender (cash / exact / next-dollar), loyalty-card scan, en-CA ⇄ fr-CA
  language toggle, live wire-log panel, connection status/config.
- **`electron/preload.ts`:** typed bridge — `window.emulator.connect/sendVJ/sendPole/onStatus`.

## The four CA behaviors (scope)

1. **Pole-authoritative tax/balance** — never emit 1005/1020; running balance
   (incl. tax) + totals flow through pole `Balance Due`/`Solde dû` windows.
2. **Bilingual EN/FR pole** — toggle between en and fr pole strings; reproduce the
   `û`→`�` quirk.
3. **Arrondir/Rounding 1022** — on cash tender, compute CAD nearest-$0.05 rounding
   and emit `EventId=1022,…,Description=Arrondir,Amount=(…)`.
4. **EventId 1024 EasyPay loyalty** — loyalty-scan UI emits 1024 with a field for a
   12-digit UPC vs a loyalty number to exercise the discriminator path.

## Data flow

React action → update `Basket` → `Radiant6CanadaEncoder` produces VJ lines + pole
frames → IPC → `PosTransport` TCP write → CKPlayer2.0 CA parsers → player renders.

## Error handling

Socket connect/retry surfaced in UI status; configurable host/ports; encoder guards
on malformed input; pole buffer framing kept 20-char-aligned.

## Testing (Vitest, matching CKPlayer2.0)

- `Basket` model unit tests (cents math, discounts, rounding).
- `Radiant6CanadaEncoder` unit tests asserting exact emitted strings against gold
  frames reused from CKPlayer2.0's parser tests.
- Optional stretch: round-trip test feeding encoder output through a vendored copy
  of the parser, asserting expected `RegisterEvent`s.
- A unit test accompanies every new code unit.

## Location & stack

- New sibling project: `/Users/dev.kelvin/Documents/Rocket Partners/LIFT/radiant6-canada-emulator/`
- Stack: `electron-vite` + React + TypeScript + Vitest.
