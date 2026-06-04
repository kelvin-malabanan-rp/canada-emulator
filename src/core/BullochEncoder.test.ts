import { describe, it, expect } from 'vitest';
import { BullochEncoder } from './BullochEncoder';

const enc = new BullochEncoder();

describe('BullochEncoder.newSale', () => {
  it('emits [C000] NEWSALE LANG=EN for en', () => {
    expect(enc.newSale('en')).toBe('[C000] NEWSALE LANG=EN\n');
  });

  it('emits LANG=FR for fr', () => {
    expect(enc.newSale('fr')).toBe('[C000] NEWSALE LANG=FR\n');
  });
});

describe('BullochEncoder.itemAdd', () => {
  it('emits a [C110] barcode item line with embedded running totals', () => {
    expect(
      enc.itemAdd({
        barcode: '0000000002125',
        description: 'FROSTER SWIRL 350M',
        quantity: 1,
        priceCents: 219,
        subtotalCents: 219,
        taxCents: 28,
        totalCents: 247,
      }),
    ).toBe('[C110] 0000000002125 FROSTER SWIRL 350M QT=1 PR=2.19 AMT=2.19 STTL=2.19 DSC=0.00 TAX=0.28 TOTAL=2.47\n');
  });

  it('computes AMT as unit price × quantity', () => {
    const line = enc.itemAdd({
      barcode: '123',
      description: 'X',
      quantity: 3,
      priceCents: 200,
      subtotalCents: 600,
      taxCents: 0,
      totalCents: 600,
    });
    expect(line).toContain('QT=3 PR=2.00 AMT=6.00 ');
  });

  it('renders a supplied discount in DSC', () => {
    const line = enc.itemAdd({
      barcode: '0006150012825',
      description: 'JOKER MAD ENERGY S',
      quantity: 1,
      priceCents: 249,
      subtotalCents: 102,
      discountCents: 198,
      taxCents: 39,
      totalCents: 339,
    });
    expect(line).toContain(' DSC=1.98 ');
  });

  it('strips non-digits from the barcode (parity with legacy formatBarcode)', () => {
    const line = enc.itemAdd({
      barcode: 'A12-34',
      description: 'X',
      quantity: 1,
      priceCents: 100,
      subtotalCents: 100,
      taxCents: 0,
      totalCents: 100,
    });
    expect(line.startsWith('[C110] 1234 X ')).toBe(true);
  });

  it('emits 0 for an empty/non-numeric barcode', () => {
    const line = enc.itemAdd({
      barcode: '',
      description: 'X',
      quantity: 1,
      priceCents: 100,
      subtotalCents: 100,
      taxCents: 0,
      totalCents: 100,
    });
    expect(line.startsWith('[C110] 0 X ')).toBe(true);
  });
});

describe('BullochEncoder.undoItem', () => {
  it('emits [C120] Undo Item with a two-space gap and embedded totals', () => {
    expect(
      enc.undoItem({ description: 'HD CHEESE STICKS H', subtotalCents: 169, taxCents: 22, totalCents: 191 }),
    ).toBe('[C120] Undo Item  HD CHEESE STICKS H STTL=1.69 DSC=0.00 TAX=0.22 TOTAL=1.91\n');
  });
});

describe('BullochEncoder.clearSale', () => {
  it('emits [C121] CLEAR SALE', () => {
    expect(enc.clearSale()).toBe('[C121] CLEAR SALE\n');
  });
});

describe('BullochEncoder.saleClose', () => {
  it('emits [C200] Sale with a 6-digit zero-padded TRANS and totals', () => {
    expect(enc.saleClose({ tx: 2070, totalCents: 120, changeCents: 0, taxCents: 0 })).toBe(
      '[C200] Sale TRANS=002070 TOTAL=1.20 CHNG=0.00 TAX=0.00\n',
    );
  });
});
