import { describe, expect, it } from 'vitest';
import { currencyDecimals, formatAmount, formatMoney } from './format';
import { normalizeWhatsAppPhone, whatsAppUrl } from './whatsapp';

describe('money format', () => {
  it('knows which currencies use 3 decimals', () => {
    expect(currencyDecimals('OMR')).toBe(3);
    expect(currencyDecimals('kwd')).toBe(3);
    expect(currencyDecimals('AED')).toBe(2);
    expect(currencyDecimals('JPY')).toBe(0);
  });

  it('shows whole amounts plainly and fractions at full currency precision', () => {
    expect(formatMoney(1250, 'OMR')).toBe('OMR 1,250');
    expect(formatMoney(220.5, 'OMR')).toBe('OMR 220.500');
    expect(formatMoney(0.125, 'OMR')).toBe('OMR 0.125');
    expect(formatMoney(99.5, 'AED')).toBe('AED 99.50');
    expect(formatAmount(-30, 'OMR')).toBe('-30');
  });

  it('rounds to the currency precision so float noise never shows', () => {
    expect(formatAmount(0.1 + 0.2, 'OMR')).toBe('0.300');
    expect(formatAmount(10.004, 'AED')).toBe('10');
  });
});

describe('WhatsApp links', () => {
  it('normalises international numbers', () => {
    expect(normalizeWhatsAppPhone('+968 9123-4567')).toBe('96891234567');
    expect(normalizeWhatsAppPhone('00968 91234567')).toBe('96891234567');
  });

  it('encodes the message and refuses unusable numbers', () => {
    expect(whatsAppUrl('96891234567', 'Hi & thanks')).toBe('https://wa.me/96891234567?text=Hi%20%26%20thanks');
    expect(whatsAppUrl('', 'x')).toBeNull();
    expect(whatsAppUrl('123', 'x')).toBeNull();
  });
});
