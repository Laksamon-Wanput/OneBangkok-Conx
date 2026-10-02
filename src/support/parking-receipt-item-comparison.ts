import type { DatabaseParkingReceiptItemRow } from './parking-receipt-item-database';
import type { ConxReference } from '../types/parking-transaction';
import type {
  ParkingReceiptItem,
  ParkingReceiptItemExport,
} from '../types/parking-receipt-item';

const COMPARISON_FIELDS = [
  'Parking Receipt Item Name',
  'Parking Transaction',
  'Customer',
  'Description',
  'Quantity',
  'Total Price',
] as const;

type ComparisonField = (typeof COMPARISON_FIELDS)[number];
type ComparableRow = Record<ComparisonField, string>;

export type ParkingReceiptItemComparisonIssue = {
  email: string;
  result: 'FIELD_MISMATCH' | 'MISSING_ON_WEBSITE' | 'MISSING_IN_DATABASE';
  parkingReceiptItemName: string;
  occurrence: number;
  field: ComparisonField | '(row)';
  databaseValue: string;
  websiteValue: string;
};

export type ParkingReceiptItemComparisonResult = {
  databaseRowCount: number;
  websiteRowCount: number;
  issues: ParkingReceiptItemComparisonIssue[];
};

export function compareParkingReceiptItems(
  email: string,
  databaseRows: DatabaseParkingReceiptItemRow[],
  websiteExport: ParkingReceiptItemExport,
): ParkingReceiptItemComparisonResult {
  const websiteGroups = new Map<string, ComparableRow[]>();

  for (const item of websiteExport.items) {
    const row = websiteRow(item, websiteExport.customerAccountByItemDocumentId);
    const name = row['Parking Receipt Item Name'];
    const group = websiteGroups.get(name) ?? [];
    group.push(row);
    websiteGroups.set(name, group);
  }

  const occurrences = new Map<string, number>();
  const issues: ParkingReceiptItemComparisonIssue[] = [];

  for (const databaseRecord of databaseRows) {
    const database = databaseRow(databaseRecord);
    const name = database['Parking Receipt Item Name'];
    const occurrence = (occurrences.get(name) ?? 0) + 1;
    occurrences.set(name, occurrence);

    const website = websiteGroups.get(name)?.shift();
    if (!website) {
      issues.push({
        email,
        result: 'MISSING_ON_WEBSITE',
        parkingReceiptItemName: name,
        occurrence,
        field: '(row)',
        databaseValue: JSON.stringify(database),
        websiteValue: '',
      });
      continue;
    }

    for (const field of COMPARISON_FIELDS) {
      if (database[field] !== website[field]) {
        issues.push({
          email,
          result: 'FIELD_MISMATCH',
          parkingReceiptItemName: name,
          occurrence,
          field,
          databaseValue: database[field],
          websiteValue: website[field],
        });
      }
    }
  }

  for (const [name, rows] of websiteGroups) {
    for (const website of rows) {
      const occurrence = (occurrences.get(name) ?? 0) + 1;
      occurrences.set(name, occurrence);
      issues.push({
        email,
        result: 'MISSING_IN_DATABASE',
        parkingReceiptItemName: name,
        occurrence,
        field: '(row)',
        databaseValue: '',
        websiteValue: JSON.stringify(website),
      });
    }
  }

  return {
    databaseRowCount: databaseRows.length,
    websiteRowCount: websiteExport.items.length,
    issues,
  };
}

export function parkingReceiptItemComparisonReportCsv(
  email: string,
  result: ParkingReceiptItemComparisonResult,
): string {
  const headers = [
    'Email',
    'Result',
    'Parking Receipt Item Name',
    'Database Value',
    'Website Value',
  ];
  const rows = result.issues.length
    ? result.issues.map((issue) => {
        const fieldPrefix = issue.result === 'FIELD_MISMATCH'
          ? `${issue.field}: `
          : '';
        return [
          issue.email,
          issue.result,
          issue.parkingReceiptItemName,
          `${fieldPrefix}${issue.databaseValue}`,
          `${fieldPrefix}${issue.websiteValue}`,
        ];
      })
    : [[email, 'PASSED', '', '', '']];

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}\r\n`;
}

function databaseRow(row: DatabaseParkingReceiptItemRow): ComparableRow {
  return {
    'Parking Receipt Item Name': text(row['Parking Receipt Item Name']),
    'Parking Transaction': text(row['Parking Transaction']),
    Customer: text(row.Customer),
    Description: text(row.Description),
    Quantity: numericValue(row.Quantity),
    'Total Price': numericValue(row['Total Price']),
  };
}

function websiteRow(
  item: ParkingReceiptItem,
  customerAccountByItemDocumentId: Record<string, string | null>,
): ComparableRow {
  const parkingTransaction = reference(item.parkingTransaction);
  return {
    'Parking Receipt Item Name': text(item.cx_Name),
    'Parking Transaction': text(parkingTransaction?.label),
    Customer: text(customerAccountByItemDocumentId[item._docId]),
    Description: text(item.description),
    Quantity: numericValue(item.quantity),
    'Total Price': numericValue(item.totalPrice),
  };
}

function reference(value: unknown): ConxReference | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ConxReference)
    : undefined;
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '-') return '';
  return String(value).trim();
}

function numericValue(value: unknown): string {
  const normalized = text(value);
  if (normalized === '') return '';
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : normalized;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
