import { describe, it, expect } from 'vitest';
import { parseInjectCommand, formatInjectCommand, INJECT_EVENT_ID } from './injectProtocol';

describe('parseInjectCommand', () => {
  it('parses a player→register inject line', () => {
    expect(parseInjectCommand('EventId=2001,Barcode=049000000443,Quantity=2')).toEqual({
      barcode: '049000000443',
      quantity: 2,
    });
  });

  it('defaults quantity to 1 when absent', () => {
    expect(parseInjectCommand('EventId=2001,Barcode=123')).toEqual({ barcode: '123', quantity: 1 });
  });

  it('tolerates a trailing CRLF and whitespace', () => {
    expect(parseInjectCommand('EventId=2001,Barcode=123,Quantity=3\r\n')).toEqual({ barcode: '123', quantity: 3 });
  });

  it('returns null for a normal journal event (not an inject)', () => {
    expect(parseInjectCommand('EventId=1011,Barcode=123,Quantity=1')).toBeNull();
  });

  it('returns null when the barcode is missing or empty', () => {
    expect(parseInjectCommand('EventId=2001,Quantity=1')).toBeNull();
    expect(parseInjectCommand('EventId=2001,Barcode=,Quantity=1')).toBeNull();
  });

  it('returns null for an empty line', () => {
    expect(parseInjectCommand('')).toBeNull();
  });
});

describe('formatInjectCommand', () => {
  it('produces a CRLF-terminated inject line round-trippable by the parser', () => {
    const line = formatInjectCommand({ barcode: '049000000443', quantity: 2 });
    expect(line).toBe(`EventId=${INJECT_EVENT_ID},Barcode=049000000443,Quantity=2\r\n`);
    expect(parseInjectCommand(line)).toEqual({ barcode: '049000000443', quantity: 2 });
  });

  it('defaults quantity to 1', () => {
    expect(formatInjectCommand({ barcode: '123' })).toBe(`EventId=${INJECT_EVENT_ID},Barcode=123,Quantity=1\r\n`);
  });
});
