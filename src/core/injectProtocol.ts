/**
 * Radiant6 Canada completer-inject protocol — the player→register reverse channel.
 *
 * When a cashier accepts an upsell ("completer") on CK Player 2.0, the player
 * writes an inject command back down the VirtualJournal socket to the register.
 * Radiant6 has no legacy inject format, so this is a NET-NEW contract shared by
 * CK Player 2.0 (`Radiant6CanadaScanner` → `VirtualJournal.injectScan`) and this
 * emulator (`PosTransport` inbound reader).
 *
 * Reserved EventId 2001 keeps it clearly outside the 10xx journal range the
 * register emits. The register stays authoritative for the basket: on receiving
 * an inject it rings the item up and emits the normal EventId 1011 back, so the
 * completer item reaches the basket through the existing journal path.
 *
 * Pure / browser-safe (no Node or Electron imports).
 */

/** Reserved EventId for a player→register inject (outside the 10xx journal range). */
export const INJECT_EVENT_ID = '2001';

export interface InjectCommand {
  barcode: string;
  quantity: number;
}

/** Parse a single line into an InjectCommand, or null if it isn't one. */
export function parseInjectCommand(line: string): InjectCommand | null {
  if (!line) return null;
  const fields = new Map<string, string>();
  for (const piece of line.replace(/\r?\n$/, '').split(',')) {
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    fields.set(piece.slice(0, eq).trim(), piece.slice(eq + 1).trim());
  }
  if (fields.get('EventId') !== INJECT_EVENT_ID) return null;

  const barcode = fields.get('Barcode') ?? '';
  if (!barcode) return null;

  const qtyRaw = fields.get('Quantity');
  const qty = qtyRaw !== undefined && Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : 1;
  const quantity = qty > 0 ? qty : 1;

  return { barcode, quantity };
}

/** Build a CRLF-terminated inject line (the contract CK Player 2.0 must mirror). */
export function formatInjectCommand(cmd: { barcode: string; quantity?: number }): string {
  const quantity = cmd.quantity && cmd.quantity > 0 ? cmd.quantity : 1;
  return `EventId=${INJECT_EVENT_ID},Barcode=${cmd.barcode},Quantity=${quantity}\r\n`;
}
