import { describe, it, expect } from 'vitest';
import { RegisterSession, type WireMessage } from './RegisterSession';

function eventIds(messages: WireMessage[]): string[] {
  return messages
    .filter((m) => m.channel === 'vj')
    .map((m) => m.data.match(/EventId=(\d+)/)?.[1] ?? '')
    .filter(Boolean);
}

describe('RegisterSession', () => {
  it('opens the lane once: registerOpen + basketStarted + pole balance', () => {
    const s = new RegisterSession();
    const msgs = s.open();
    expect(eventIds(msgs)).toEqual(['1001', '1009']);
    expect(msgs.some((m) => m.channel === 'pole')).toBe(true);
    // Idempotent — opening again emits nothing.
    expect(s.open()).toEqual([]);
  });

  it('auto-opens on first addItem and emits item add + pole windows', () => {
    const s = new RegisterSession();
    const msgs = s.addItem({ code: '049000000443', description: 'Coke', priceCents: 169 });
    expect(eventIds(msgs)).toEqual(['1001', '1009', '1011']);
    const snap = s.snapshot();
    expect(snap.lines).toHaveLength(1);
    expect(snap.subtotalCents).toBe(169);
  });

  it('void / qty / price emit their VJ events and a refreshed balance', () => {
    const s = new RegisterSession();
    s.addItem({ code: 'a', description: 'A', priceCents: 100 });
    expect(eventIds(s.setQuantity(1, 3))).toContain('1014');
    expect(s.snapshot().subtotalCents).toBe(300);
    expect(eventIds(s.setPrice(1, 50))).toContain('1013');
    expect(s.snapshot().subtotalCents).toBe(150);
    expect(eventIds(s.voidLine(1))).toContain('1012');
    expect(s.snapshot().subtotalCents).toBe(0);
  });

  it('loyalty emits EventId 1024 with the card number', () => {
    const s = new RegisterSession();
    const msgs = s.loyalty('8018782603800034999992');
    expect(msgs.find((m) => m.data.includes('EventId=1024'))?.data).toContain('DiscountCardNumber=8018782603800034999992');
  });

  it('cash-exact tender emits Arrondir rounding, tender, change, basketEnd and resets', () => {
    const s = new RegisterSession({ taxRateBps: 500 });
    s.addItem({ code: 'a', description: 'A', priceCents: 169 }); // total 177 → rounds to 175
    const msgs = s.tender('cash-exact');
    expect(eventIds(msgs)).toEqual(expect.arrayContaining(['1022', '1007', '1008', '1002']));
    expect(msgs.find((m) => m.data.includes('EventId=1022'))?.data).toContain('Description=Arrondir');
    // Resets: tx advanced, basket cleared.
    const snap = s.snapshot();
    expect(snap.tx).toBe(2);
    expect(snap.lines).toHaveLength(0);
    expect(snap.started).toBe(false);
  });

  it('voidTicket emits a cancelled basketEnd (1002), clears pole and resets', () => {
    const s = new RegisterSession();
    s.addItem({ code: 'a', description: 'A', priceCents: 169 });
    const msgs = s.voidTicket();
    const end = msgs.find((m) => m.data.includes('EventId=1002'))!;
    expect(end.data).toContain('TransactionCompletionType=Cancelled');
    const snap = s.snapshot();
    expect(snap.tx).toBe(2);
    expect(snap.lines).toHaveLength(0);
    expect(snap.started).toBe(false);
  });

  it('no rounding event when the total is already a multiple of 5 cents', () => {
    const s = new RegisterSession({ taxRateBps: 0 });
    s.addItem({ code: 'a', description: 'A', priceCents: 200 });
    expect(eventIds(s.tender('cash-exact'))).not.toContain('1022');
  });

  it('fr locale produces fr pole windows', () => {
    const s = new RegisterSession();
    s.setLocale('fr');
    const msgs = s.addItem({ code: 'a', description: 'Cafe', priceCents: 194 });
    const poleBalance = msgs.filter((m) => m.channel === 'pole').pop()!;
    expect(poleBalance.data.replace(/�/g, ' ')).toMatch(/Solde d.:/);
  });
});
