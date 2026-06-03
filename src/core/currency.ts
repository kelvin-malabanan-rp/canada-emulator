/**
 * Locale code for Canadian POS amount formatting.
 *   'en' → en-CA ($ prefix, period decimal, comma thousands)
 *   'fr' → fr-CA ($ suffix, comma decimal, U+00A0 thousands)
 */
export type PosLocale = 'en' | 'fr';

/** U+00A0 non-breaking space — the fr-CA thousands separator. */
const FR_THOUSANDS = ' ';

/** Group an integer-string into thousands using `sep`. */
function groupThousands(intStr: string, sep: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Format integer cents as a Canadian currency string.
 *
 * Built directly from integer cents — never floats — so there is no rounding
 * drift. Matches the strings CK Player 2.0's radiant6-canada parsers expect:
 * en-CA `$1.94` / `$5,000.00`, fr-CA `1,94$` / `5 000,00$`.
 */
export function formatCurrency(cents: number, locale: PosLocale): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  const sign = negative ? '-' : '';

  if (locale === 'fr') {
    const intStr = groupThousands(dollars.toString(), FR_THOUSANDS);
    return `${sign}${intStr},${frac}$`;
  }

  const intStr = groupThousands(dollars.toString(), ',');
  return `${sign}$${intStr}.${frac}`;
}
