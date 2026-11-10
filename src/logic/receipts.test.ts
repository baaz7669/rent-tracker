import { describe, expect, it } from 'vitest';
import { buildReceiptMessage, receiptFilename, receiptWhatsAppUrl, ReceiptContext } from './receipts';

function ctx(overrides: Partial<ReceiptContext> = {}, payment: Partial<ReceiptContext['payment']> = {}): ReceiptContext {
  return {
    payment: { id: 'p1', unitId: 'u1', amount: 220, date: '2026-11-05', ts: 1, receiptNo: 7, method: 'cash', ...payment },
    tenantName: 'Sara Al-Hinai',
    tenantPhone: '+968 9988-7766',
    unitLabel: 'Al Andalus Tower · Flat 101',
    currency: 'OMR',
    settings: { landlord: { name: 'Hamed', phone: '96890000000' }, receiptPrefix: 'RT-' },
    balanceAfter: 0,
    asOf: '2026-11-05',
    ...overrides,
  };
}

describe('receipt message', () => {
  it('thanks the tenant and states the balance', () => {
    const msg = buildReceiptMessage(ctx({ balanceAfter: 15 }));
    expect(msg).toContain('Receipt RT-000007');
    expect(msg).toContain('Received with thanks from Sara Al-Hinai: OMR 220 for Al Andalus Tower · Flat 101 on 2026-11-05.');
    expect(msg).toContain('Paid by: Cash');
    expect(msg).toContain('Balance outstanding as of 2026-11-05: OMR 15');
    expect(msg).toContain('— Hamed (96890000000)');
  });

  it('says all dues are paid when the balance is zero', () => {
    expect(buildReceiptMessage(ctx())).toContain('All dues paid as of 2026-11-05');
  });

  it('describes a pending cheque honestly', () => {
    const msg = buildReceiptMessage(
      ctx({}, { method: 'cheque', cheque: { number: '000503', bank: 'Bank Muscat', date: '2027-01-05', status: 'pending' } })
    );
    expect(msg).toContain('cheque for OMR 220');
    expect(msg).toContain('counts as paid once it clears');
    expect(msg).toContain('Paid by: Cheque #000503, Bank Muscat');
  });

  it('marks void and bounced receipts', () => {
    expect(buildReceiptMessage(ctx({}, { voidedAt: 1 }))).toContain('is VOID');
    expect(
      buildReceiptMessage(ctx({}, { method: 'cheque', cheque: { number: '1', date: '2026-11-05', status: 'bounced' } }))
    ).toContain('bounced');
  });
});

describe('receipt links and files', () => {
  it('builds a WhatsApp link from a formatted phone number', () => {
    const url = receiptWhatsAppUrl(ctx())!;
    expect(url.startsWith('https://wa.me/96899887766?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('RT-000007');
  });

  it('returns null without a phone number', () => {
    expect(receiptWhatsAppUrl(ctx({ tenantPhone: '' }))).toBeNull();
  });

  it('makes a safe PDF file name', () => {
    expect(receiptFilename(ctx({ tenantName: 'A/B: C' }))).toBe('Receipt RT-000007 A-B- C.pdf');
  });
});
