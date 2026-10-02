import { expect, test } from '@playwright/test';
import { toParkingReceiptItemsCsv } from '../src/support/parking-receipt-item-csv';

test('exports readable UTF-8 Parking Receipt Item CSV', () => {
  const csv = toParkingReceiptItemsCsv(
    'customer@example.com',
    [{
      _docId: 'item-doc-1',
      cx_Name: 'item-1',
      parkingTransaction: { label: 'transaction-1', value: 'transaction-doc-1' },
      description: 'Coffee, large',
      quantity: 2,
      totalPrice: 250,
    }],
    { 'item-doc-1': 'account-1' },
  );

  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"Coffee, large"');
  expect(csv).toContain('"account-1"');
});
