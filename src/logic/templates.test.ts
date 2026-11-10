import { describe, expect, it } from 'vitest';
import { activeTemplate, cleanTemplates, renderMessage, renderTemplate, TEMPLATE_SPECS, unknownFields } from './templates';

describe('renderTemplate', () => {
  it('fills fields', () => {
    expect(renderTemplate('Hi {tenant}, {amount} please.', { tenant: 'Ali', amount: 'OMR 5' })).toBe('Hi Ali, OMR 5 please.');
  });

  it('drops a line whose field has no value instead of leaving it dangling', () => {
    const text = 'Receipt {receipt_no}\nPaid by: {method}\n— {landlord}';
    expect(renderTemplate(text, { receipt_no: 'R-1', method: '', landlord: undefined })).toBe('Receipt R-1');
  });

  it('leaves unknown fields as typed so the mistake is visible', () => {
    expect(renderTemplate('Hi {tenent}', { tenant: 'Ali' })).toBe('Hi {tenent}');
  });
});

describe('templates', () => {
  it('falls back to the default when a saved template is blank', () => {
    expect(activeTemplate('paid_up', { paid_up: '   ' })).toBe(TEMPLATE_SPECS.find((s) => s.key === 'paid_up')!.defaultText);
    expect(renderMessage('paid_up', { tenant: 'Ali', unit: 'T · F1' }, { paid_up: 'Thanks {tenant}!' })).toBe('Thanks Ali!');
  });

  it('flags fields a message type does not know', () => {
    expect(unknownFields('reminder_overdue', 'Hi {tenant} {amout} {receipt_no}')).toEqual(['amout', 'receipt_no']);
    expect(unknownFields('receipt', 'Receipt {receipt_no} {method}')).toEqual([]);
  });

  it('every default uses only its own fields', () => {
    for (const spec of TEMPLATE_SPECS) expect(unknownFields(spec.key, spec.defaultText)).toEqual([]);
  });

  it('cleans saved templates', () => {
    expect(cleanTemplates({ paid_up: 'ok', bogus: 'x', receipt: '', statement: 5 })).toEqual({ paid_up: 'ok' });
    expect(cleanTemplates({})).toBeUndefined();
    expect(cleanTemplates({ paid_up: 'a'.repeat(5000) })!.paid_up).toHaveLength(1500);
  });
});
