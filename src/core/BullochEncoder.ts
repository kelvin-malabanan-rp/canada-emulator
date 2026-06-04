/**
 * BullochEncoder — produces the pole-display frames that CK Player 2.0's
 * `bulloch` plugin parses. Bulloch is POLE-ONLY: unlike Radiant6 Canada it has
 * NO virtual journal — every basket/item/change event is a `[Cxxx]` pole line,
 * with the running subtotal/tax/total embedded in each line.
 *
 * Pure / browser-safe (no Node or Electron imports). Formats cross-checked
 * against the authoritative consumer:
 *   ../CKPlayer2.0/electron/plugins/bulloch/BullochPoleDisplayParser.ts
 * and the legacy emulator
 *   ../liftck_player/.../register/bulloch/BullochRegisterEmulator.java
 *
 * Amounts are ALWAYS period-decimal (en-style) regardless of locale — the
 * parser converts with 'en'. Only the `[C000] NEWSALE LANG=` token reflects
 * the transaction language.
 */

import type { PosLocale } from './currency';

/** Two-decimal, period-style wire amount (legacy `formatDecimal`: `%.2f`). */
function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Barcode as-is, digits only (legacy `formatBarcode`): strip non-digits, no
 * padding — padding breaks short coupon codes. Empty → "0".
 */
function formatBarcode(barcode: string): string {
  const digits = (barcode ?? '').replace(/[^0-9]/g, '');
  return digits === '' ? '0' : digits;
}

export class BullochEncoder {
  /** `[C000] NEWSALE LANG=EN|FR` — basket start (the LANG value is ignored by the player). */
  newSale(locale: PosLocale): string {
    return `[C000] NEWSALE LANG=${locale === 'fr' ? 'FR' : 'EN'}\n`;
  }

  /**
   * `[C110] <barcode> <description> QT=.. PR=.. AMT=.. STTL=.. DSC=.. TAX=.. TOTAL=..`
   * — barcode-led item add. AMT is the line extended price (unit × qty); STTL/
   * TAX/TOTAL are the running basket totals after this item.
   */
  itemAdd(args: {
    barcode: string;
    description: string;
    quantity: number;
    priceCents: number;
    subtotalCents: number;
    discountCents?: number;
    taxCents: number;
    totalCents: number;
  }): string {
    const amt = Math.round(args.priceCents * args.quantity);
    return (
      `[C110] ${formatBarcode(args.barcode)} ${args.description} ` +
      `QT=${args.quantity} PR=${money(args.priceCents)} AMT=${money(amt)} ` +
      `STTL=${money(args.subtotalCents)} DSC=${money(args.discountCents ?? 0)} ` +
      `TAX=${money(args.taxCents)} TOTAL=${money(args.totalCents)}\n`
    );
  }

  /**
   * `[C120] Undo Item  <description> STTL=.. DSC=.. TAX=.. TOTAL=..` — item void.
   * Note the legacy two-space gap after "Undo Item" (the player strips
   * `[C120] Undo Item  `).
   */
  undoItem(args: {
    description: string;
    subtotalCents: number;
    discountCents?: number;
    taxCents: number;
    totalCents: number;
  }): string {
    return (
      `[C120] Undo Item  ${args.description} ` +
      `STTL=${money(args.subtotalCents)} DSC=${money(args.discountCents ?? 0)} ` +
      `TAX=${money(args.taxCents)} TOTAL=${money(args.totalCents)}\n`
    );
  }

  /** `[C121] CLEAR SALE` — void the whole ticket. */
  clearSale(): string {
    return '[C121] CLEAR SALE\n';
  }

  /** `[C200] Sale TRANS=NNNNNN TOTAL=.. CHNG=.. TAX=..` — sale close (TRANS is 6-digit zero-padded). */
  saleClose(args: { tx: number; totalCents: number; changeCents: number; taxCents: number }): string {
    const trans = String(args.tx).padStart(6, '0');
    return `[C200] Sale TRANS=${trans} TOTAL=${money(args.totalCents)} CHNG=${money(args.changeCents)} TAX=${money(args.taxCents)}\n`;
  }
}
