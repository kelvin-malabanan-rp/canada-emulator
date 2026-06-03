/**
 * OCT2000-IMPORT pricebook parser — Circle K's standard pricebook export
 * format (POS-agnostic; used by Radiant6 Canada, Bulloch, etc.). Mirrors the
 * legacy liftck_player emulator, which loaded the shared `Pricebook` class to
 * build its quick keys and resolve scans.
 *
 * Pure / browser-safe. We parse the `<DRY>` article elements:
 *   <DRY><NLU-NO>plu</NLU-NO><NLU-TEXT-LONG>desc</NLU-TEXT-LONG>
 *        <PRICE>cents</PRICE> ... <BARC><BARCODE>upc</BARCODE>...</BARC> </DRY>
 * PRICE is integer cents (legacy/Octane convention: `<PRICE>60</PRICE>` = $0.60).
 */

export interface PricebookEntry {
  plu: string;
  description: string;
  priceCents: number;
  barcodes: string[];
}

/** UPC/PLU → resolved item details. */
export interface ResolvedItem {
  code: string;
  description: string;
  priceCents: number;
  plu: string;
}

function firstTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>(.*?)</${tag}>`, 's').exec(xml);
  return m ? m[1].trim() : null;
}

/** Parse an OCT2000-IMPORT pricebook into DRY article entries. */
export function parsePricebook(xml: string): PricebookEntry[] {
  const entries: PricebookEntry[] = [];
  const dryRe = /<DRY\b[^>]*>(.*?)<\/DRY>/gs;
  let m: RegExpExecArray | null;
  while ((m = dryRe.exec(xml)) !== null) {
    const body = m[1];
    // Article-level fields appear before the first <BARC> block; slice there so
    // we read the DRY's own PRICE, not a nested barcode PRICE.
    const head = body.split('<BARC')[0];
    const plu = firstTag(head, 'NLU-NO') ?? '';
    const description = firstTag(head, 'NLU-TEXT-LONG') ?? firstTag(head, 'NLU-TEXT') ?? '';
    const priceRaw = firstTag(head, 'PRICE');
    const priceCents = priceRaw !== null && /^-?\d+$/.test(priceRaw) ? parseInt(priceRaw, 10) : 0;

    const barcodes: string[] = [];
    const barcRe = /<BARCODE>(.*?)<\/BARCODE>/gs;
    let b: RegExpExecArray | null;
    while ((b = barcRe.exec(body)) !== null) {
      const code = b[1].trim();
      if (code) barcodes.push(code);
    }

    if (plu || barcodes.length > 0) {
      entries.push({ plu, description, priceCents, barcodes });
    }
  }
  return entries;
}

/**
 * Build a lookup index keyed by every barcode AND the PLU number, so a scan of
 * either resolves the item (mirrors legacy emulator item lookup by name/code).
 */
export function buildPricebookIndex(entries: PricebookEntry[]): Map<string, ResolvedItem> {
  const index = new Map<string, ResolvedItem>();
  for (const e of entries) {
    const resolved: ResolvedItem = { code: '', description: e.description, priceCents: e.priceCents, plu: e.plu };
    if (e.plu) index.set(e.plu, { ...resolved, code: e.plu });
    for (const code of e.barcodes) {
      index.set(code, { ...resolved, code });
    }
  }
  return index;
}

/** Convenience: parse + index in one step. */
export function loadPricebookIndex(xml: string): Map<string, ResolvedItem> {
  return buildPricebookIndex(parsePricebook(xml));
}
