import { Unit } from '../types';

export const SAMPLE_UNITS: Omit<Unit, 'id'>[] = [
  {
    building: 'Al Andalus Tower',
    name: 'Flat 101',
    type: 'Flat',
    tenant: 'Tariq Al-Balushi',
    phone: '96800000001',
    rent: 220,
    every: 1,
    firstDue: '2026-08-01',
    opening: 0,
    leaseEnd: '2026-10-25'
  },
  {
    building: 'Al Andalus Tower',
    name: 'Flat 204',
    type: 'Flat',
    tenant: 'Salim Al-Harthy',
    phone: '96800000002',
    rent: 250,
    every: 1,
    firstDue: '2026-09-01',
    opening: 50,
    leaseEnd: '2026-12-15'
  },
  {
    building: 'Ruwi Commercial Plaza',
    name: 'Shop 3',
    type: 'Shop',
    tenant: 'Golden Spices LLC',
    phone: '96800000003',
    rent: 450,
    every: 3,
    firstDue: '2026-07-01',
    opening: 0,
    leaseEnd: '2026-10-10'
  },
  {
    building: 'Ruwi Commercial Plaza',
    name: 'Shop 7',
    type: 'Shop',
    tenant: 'Modern Electronics',
    phone: '96800000004',
    rent: 500,
    every: 1,
    firstDue: '2026-09-29',
    opening: 0,
    leaseEnd: '2027-04-30'
  },
  {
    building: 'Bousher Heights',
    name: 'Flat 302',
    type: 'Flat',
    tenant: 'Fatima Al-Riyami',
    phone: '96800000005',
    rent: 180,
    every: 1,
    firstDue: '2026-09-15',
    opening: 0,
    leaseEnd: '2026-11-20'
  },
  {
    building: 'Bousher Heights',
    name: 'Office 12',
    type: 'Office',
    tenant: 'Apex Consulting',
    phone: '96800000006',
    rent: 320,
    every: 1,
    firstDue: '2026-10-02',
    opening: 0,
    leaseEnd: '2027-08-31'
  }
];
