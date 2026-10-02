import { expect, test } from '@playwright/test';
import { toParkingTransactionsCsv } from '../src/support/parking-csv';

test('exports readable UTF-8 CSV and escapes special characters', () => {
  const csv = toParkingTransactionsCsv('customer@example.com', [
    {
      _docId: 'document-1',
      cx_Name: 'parking-1',
      customers: { label: 'ลูกค้า, ทดสอบ', value: 'customer-1' },
      merchantName: 'Coffee "Shop"',
      transactionDate: { _seconds: 1_790_640_000 },
      transactionTime: { _seconds: 37_980 },
      createdBy: { label: 'QA User', value: 'user-1' },
    },
  ]);

  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"ลูกค้า, ทดสอบ"');
  expect(csv).toContain('"Coffee ""Shop"""');
  expect(csv).toContain('"2026-09-29"');
  expect(csv).toContain('"10:33:00"');
});
