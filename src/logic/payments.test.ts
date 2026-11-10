import { describe, expect, it } from 'vitest';
import { buildChequeSeries, formatReceiptNo, nextChequeNumber, paymentMethodLabel, paymentState, receiptLabel } from './payments';
import { addMonthsClamped } from './rentEngine';

describe('cheque numbers and series', () => {
  it('increments numeric cheque numbers keeping leading zeros and prefixes', () => {
    expect(nextChequeNumber('000123')).toBe('000124');
    expect(nextChequeNumber('CHQ-0099')).toBe('CHQ-0100');
    expect(nextChequeNumber('42', 3)).toBe('45');
    expect(nextChequeNumber('ABC')).toBe('ABC');
  });

  it('builds a monthly series of post-dated cheques with clamped month ends', () => {
    const series = buildChequeSeries(
      { count: 3, firstNumber: '000501', firstDate: '2026-01-31', everyMonths: 1 },
      addMonthsClamped
    );
    expect(series).toEqual([
      { number: '000501', date: '2026-01-31' },
      { number: '000502', date: '2026-02-28' },
      { number: '000503', date: '2026-03-31' },
    ]);
  });

  it('follows quarterly cycles and caps unreasonable counts', () => {
    const q = buildChequeSeries({ count: 2, firstNumber: '7', firstDate: '2026-01-01', everyMonths: 3 }, addMonthsClamped);
    expect(q.map((c) => c.date)).toEqual(['2026-01-01', '2026-04-01']);
    expect(buildChequeSeries({ count: 500, firstNumber: '1', firstDate: '2026-01-01', everyMonths: 1 }, addMonthsClamped)).toHaveLength(60);
    expect(buildChequeSeries({ count: 0, firstNumber: '1', firstDate: '2026-01-01', everyMonths: 1 }, addMonthsClamped)).toHaveLength(1);
  });
});

describe('labels', () => {
  it('formats receipt numbers', () => {
    expect(formatReceiptNo(42)).toBe('R-000042');
    expect(formatReceiptNo(7, 'RT/')).toBe('RT/000007');
    expect(formatReceiptNo(7, '')).toBe('000007');
  });

  it('keeps the prefix a receipt was issued with', () => {
    expect(receiptLabel({ receiptNo: 3, receiptPrefix: 'R-' }, { receiptPrefix: 'AT-' })).toBe('R-000003');
    expect(receiptLabel({ receiptNo: 3 }, { receiptPrefix: 'AT-' })).toBe('AT-000003');
    expect(receiptLabel({}, { receiptPrefix: 'AT-' })).toBe('');
  });

  it('describes payment method and state', () => {
    expect(paymentMethodLabel({ method: 'cheque', cheque: { number: '55', date: '2026-01-01', status: 'pending' } })).toBe('Cheque #55');
    expect(paymentMethodLabel({ method: 'transfer', reference: 'TRX9' })).toBe('Bank transfer (TRX9)');
    expect(paymentMethodLabel({})).toBe('');
    expect(paymentState({ voidedAt: 1, cheque: { number: '1', date: '2026-01-01', status: 'pending' } })).toBe('void');
    expect(paymentState({ cheque: { number: '1', date: '2026-01-01', status: 'bounced' } })).toBe('bounced');
    expect(paymentState({})).toBe('received');
  });
});
