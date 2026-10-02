import { expect, test } from '@playwright/test';
import {
  compareParkingTransactions,
  comparisonReportCsv,
} from '../src/support/parking-comparison';
import type { DatabaseParkingRow } from '../src/support/parking-database';
import type { ParkingTransactionExport } from '../src/types/parking-transaction';
import { parkingEmailFromArgs } from '../src/support/parking-test-data';

const databaseRow: DatabaseParkingRow = {
  'Parking Detail ID': 'parking-1',
  'Check Handwriting 2': true,
  Address: 'Bangkok',
  Counter: 'C01',
  Customer: 'account-1',
  'Image Url': null,
  'Mall Name': 'One Bangkok',
  'Merchant Name': 'Coffee Shop',
  Message: 'Receipt is valid',
  'Receipt No': 'R-001',
  Status: 'SUCCESS',
  Total: '250.00',
  'Transaction Date': '2026-09-29',
  'Transaction Time': '10:33:00',
  UID: 'uid-1',
  'Unit No': 'G-12',
  'Created User': 'QA User',
};

const websiteExport: ParkingTransactionExport = {
  email: 'customer@example.com',
  customerDocumentIds: ['customer-doc-1'],
  customerAccountsByDocumentId: { 'customer-doc-1': 'account-1' },
  fetchedAt: '2026-09-30T00:00:00.000Z',
  count: 1,
  transactions: [{
    _docId: 'website-doc-1', cx_Name: 'parking-1', checkHandwriting2: true,
    address: 'Bangkok', counter: 'C01',
    customers: { label: 'Customer', value: 'customer-doc-1' }, imageUrl_02: null,
    mallName: 'One Bangkok', merchantName: 'Coffee Shop', message: 'Receipt is valid',
    receiptNo: 'R-001', status: 'SUCCESS', total: '250',
    transactionDate: { _seconds: 1_790_640_000 }, transactionTime: { _seconds: 37_980 },
    uid: 'uid-1', unitNo: 'G-12', createdBy: { label: 'QA User', value: 'user-1' },
  }],
};

test('passes when normalized database and website rows match', () => {
  const result = compareParkingTransactions('customer@example.com', [databaseRow], websiteExport);
  expect(result.issues).toEqual([]);
  const csv = comparisonReportCsv('customer@example.com', result);
  expect(csv).toContain('"PASSED"');
  expect(csv.split('\r\n')[0]).toBe(
    '\uFEFF"Email","Result","Parking Detail ID","Database Value","Website Value"',
  );
  expect(csv).not.toContain('"Occurrence"');
  expect(csv).not.toContain('"Field"');
});

test('reports field mismatches and missing rows', () => {
  const result = compareParkingTransactions(
    'customer@example.com',
    [{ ...databaseRow, Status: 'FAILED' }, { ...databaseRow, 'Parking Detail ID': 'parking-2' }],
    websiteExport,
  );
  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ result: 'FIELD_MISMATCH', field: 'Status' }),
    expect.objectContaining({ result: 'MISSING_ON_WEBSITE', parkingDetailId: 'parking-2' }),
  ]));
  const csv = comparisonReportCsv('customer@example.com', result);
  expect(csv).toContain('"Status: FAILED"');
  expect(csv).toContain('"Status: SUCCESS"');
});

test('reads and normalizes the email supplied on the command line', () => {
  expect(parkingEmailFromArgs(['--email', ' Customer+QA@Example.COM '])).toBe(
    'customer+qa@example.com',
  );
  expect(parkingEmailFromArgs(['--email=customer@example.com'])).toBe(
    'customer@example.com',
  );
});

test('rejects an invalid command-line email', () => {
  expect(() => parkingEmailFromArgs(['--email', 'not-an-email'])).toThrow(
    'Invalid email provided with --email',
  );
});
