import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('en-CA: $ prefix, period decimal', () => {
    expect(formatCurrency(194, 'en')).toBe('$1.94');
    expect(formatCurrency(0, 'en')).toBe('$0.00');
    expect(formatCurrency(6, 'en')).toBe('$0.06');
    expect(formatCurrency(500000, 'en')).toBe('$5,000.00');
  });

  it('fr-CA: $ suffix, comma decimal, U+00A0 thousands separator', () => {
    expect(formatCurrency(194, 'fr')).toBe('1,94$');
    expect(formatCurrency(1030, 'fr')).toBe('10,30$');
    expect(formatCurrency(500000, 'fr')).toBe('5 000,00$');
  });

  it('handles negative amounts', () => {
    expect(formatCurrency(-194, 'en')).toBe('-$1.94');
    expect(formatCurrency(-194, 'fr')).toBe('-1,94$');
  });
});
