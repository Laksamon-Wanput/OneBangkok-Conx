import { expect, test } from '@playwright/test';
import {
  compareParkingReceiptItems,
  parkingReceiptItemComparisonReportCsv,
} from '../src/support/parking-receipt-item-comparison';
import type { DatabaseParkingReceiptItemRow } from '../src/support/parking-receipt-item-database';
import type { ParkingReceiptItemExport } from '../src/types/parking-receipt-item';

const databaseRow: DatabaseParkingReceiptItemRow = {
  'Parking Receipt Item Name': 'item-1',
  'Parking Transaction': 'transaction-1',
  Customer: 'account-1',
  Description: 'Coffee',
  Quantity: '2.00',
  'Total Price': '250.00',
};

const websiteExport: ParkingReceiptItemExport = {
  email: 'customer@example.com',
  customerDocumentIds: ['customer-doc-1'],
  customerAccountByItemDocumentId: { 'item-doc-1': 'account-1' },
  fetchedAt: '2026-09-30T00:00:00.000Z',
  count: 1,
  items: [{
    _docId: 'item-doc-1',
    cx_Name: 'item-1',
    parkingTransaction: { label: 'transaction-1', value: 'transaction-doc-1' },
    customers: { label: 'Customer', value: 'customer-doc-1' },
    description: 'Coffee',
    quantity: '2',
    totalPrice: '250',
  }],
};

test('passes when normalized Parking Receipt Item rows match', () => {
  const result = compareParkingReceiptItems(
    'customer@example.com',
    [databaseRow],
    websiteExport,
  );
  expect(result.issues).toEqual([]);
  const csv = parkingReceiptItemComparisonReportCsv('customer@example.com', result);
  expect(csv).toContain('"PASSED"');
  expect(csv.split('\r\n')[0]).toBe(
    '\uFEFF"Email","Result","Parking Receipt Item Name","Database Value","Website Value"',
  );
});

test('reports Parking Receipt Item field mismatches and missing rows', () => {
  const result = compareParkingReceiptItems(
    'customer@example.com',
    [
      { ...databaseRow, Quantity: '3' },
      { ...databaseRow, 'Parking Receipt Item Name': 'item-2' },
    ],
    websiteExport,
  );

  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ result: 'FIELD_MISMATCH', field: 'Quantity' }),
    expect.objectContaining({
      result: 'MISSING_ON_WEBSITE',
      parkingReceiptItemName: 'item-2',
    }),
  ]));
  const csv = parkingReceiptItemComparisonReportCsv('customer@example.com', result);
  expect(csv).toContain('"Quantity: 3"');
  expect(csv).toContain('"Quantity: 2"');
  expect(csv).not.toContain('"Occurrence"');
  expect(csv).not.toContain('"Field"');
});
