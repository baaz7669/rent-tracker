import { describe, expect, it } from 'vitest';
import { csvCell, paymentsCsv, toCsv, unitsCsv } from './csvExport';
import { Payment, Tenancy, Unit } from '../types';

const parse = (csv: string) => csv.replace(/^﻿/, '').split('\r\n');

describe('csv helpers', () => {
  it('quotes text, doubles quotes and leaves numbers bare', () => {
    expect(csvCell('Tower "A", East')).toBe('"Tower ""A"", East"');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-30)).toBe('-30');
    expect(csvCell(undefined)).toBe('');
  });

  it('neutralises text that a spreadsheet would treat as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+968 9123')).toBe(`"'+968 9123"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
  });

  it('starts with a byte-order mark for Excel and uses CRLF', () => {
    const csv = toCsv(['Name'], [['سالم'], ['Ali']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(parse(csv)).toEqual(['"Name"', '"سالم"', '"Ali"']);
  });
});

describe('payments CSV', () => {
  const units = [{ id: 'u1', building: 'Tower', name: 'Flat 1' }];
  const tenancies: Tenancy[] = [
    { id: 'old', unitId: 'u1', tenant: 'Ali', phone: '', rent: 1, every: 1, firstDue: '2025-01-01', endedAt: '2025-12-01' },
    { id: 'new', unitId: 'u1', tenant: 'Sara', phone: '', rent: 1, every: 1, firstDue: '2026-01-01' },
  ];
  const payments: Payment[] = [
    { id: 'p1', unitId: 'u1', tenancyId: 'old', amount: 100, date: '2025-06-01', ts: 1, method: 'cash', receiptNo: 4, receiptPrefix: 'R-' },
    {
      id: 'p2', unitId: 'u1', tenancyId: 'new', amount: 200, date: '2026-02-01', ts: 2, method: 'cheque',
      cheque: { number: '77', bank: 'NBO', date: '2026-02-01', status: 'pending' },
    },
    { id: 'p3', unitId: 'u1', tenancyId: 'new', amount: 50, date: '2026-01-15', ts: 3, voidedAt: 9 },
  ];

  it('names the tenant who actually paid and shows status, method and receipt', () => {
    const rows = parse(paymentsCsv(payments, units, tenancies, { receiptPrefix: 'AT-' }));
    expect(rows[0]).toContain('"Counts as paid"');
    expect(rows[1]).toBe('"2026-02-01","Tower","Flat 1","Sara",200,"Cheque pending","No","Cheque","77","NBO","2026-02-01","","","","p2"');
    expect(rows[2]).toContain('"Void","No"');
    expect(rows[3]).toBe('"2025-06-01","Tower","Flat 1","Ali",100,"Received","Yes","Cash","","","","","R-000004","","p1"');
  });
});

describe('units CSV', () => {
  it('marks vacant units instead of exporting an empty tenant with zero rent', () => {
    const vacant: Unit = { id: 'u2', building: 'Tower', name: 'Flat 2', type: 'Flat', tenant: '', phone: '', rent: 0, every: 1, firstDue: '', isVacant: true };
    const rows = parse(unitsCsv([vacant]));
    expect(rows[1]).toBe('"Tower","Flat 2","Flat","Vacant","","",,,"",,"",,""');
  });
});
