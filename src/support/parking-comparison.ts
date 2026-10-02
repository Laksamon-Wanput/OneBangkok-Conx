import type { DatabaseParkingRow } from './parking-database';
import type {
  ConxReference,
  ParkingTransaction,
  ParkingTransactionExport,
} from '../types/parking-transaction';

const COMPARISON_FIELDS = [
  'Parking Detail ID',
  'Check Handwriting 2',
  'Address',
  'Counter',
  'Customer',
  'Image Url',
  'Mall Name',
  'Merchant Name',
  'Message',
  'Receipt No',
  'Status',
  'Total',
  'Transaction Date',
  'Transaction Time',
  'UID',
  'Unit No',
  'Created User',
] as const;

type ComparisonField = (typeof COMPARISON_FIELDS)[number];
type ComparableRow = Record<ComparisonField, string>;

export type ParkingComparisonIssue = {
  email: string;
  result: 'FIELD_MISMATCH' | 'MISSING_ON_WEBSITE' | 'MISSING_IN_DATABASE';
  parkingDetailId: string;
  occurrence: number;
  field: ComparisonField | '(row)';
  databaseValue: string;
  websiteValue: string;
};

export type ParkingComparisonResult = {
  databaseRowCount: number;
  websiteRowCount: number;
  issues: ParkingComparisonIssue[];
};

export function compareParkingTransactions(
  email: string,
  databaseRows: DatabaseParkingRow[],
  websiteExport: ParkingTransactionExport,
): ParkingComparisonResult {
  const websiteGroups = new Map<string, ComparableRow[]>();

  for (const transaction of websiteExport.transactions) {
    const row = websiteRow(transaction, websiteExport.customerAccountsByDocumentId);
    const id = row['Parking Detail ID'];
    const group = websiteGroups.get(id) ?? [];
    group.push(row);
    websiteGroups.set(id, group);
  }

  const occurrences = new Map<string, number>();
  const issues: ParkingComparisonIssue[] = [];

  for (const databaseRecord of databaseRows) {
    const database = databaseRow(databaseRecord);
    const id = database['Parking Detail ID'];
    const occurrence = (occurrences.get(id) ?? 0) + 1;
    occurrences.set(id, occurrence);

    const website = websiteGroups.get(id)?.shift();
    if (!website) {
      issues.push({
        email,
        result: 'MISSING_ON_WEBSITE',
        parkingDetailId: id,
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
          parkingDetailId: id,
          occurrence,
          field,
          databaseValue: database[field],
          websiteValue: website[field],
        });
      }
    }
  }

  for (const [id, rows] of websiteGroups) {
    for (const website of rows) {
      const occurrence = (occurrences.get(id) ?? 0) + 1;
      occurrences.set(id, occurrence);
      issues.push({
        email,
        result: 'MISSING_IN_DATABASE',
        parkingDetailId: id,
        occurrence,
        field: '(row)',
        databaseValue: '',
        websiteValue: JSON.stringify(website),
      });
    }
  }

  return {
    databaseRowCount: databaseRows.length,
    websiteRowCount: websiteExport.transactions.length,
    issues,
  };
}

export function comparisonReportCsv(
  email: string,
  result: ParkingComparisonResult,
): string {
  const headers = [
    'Email',
    'Result',
    'Parking Detail ID',
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
          issue.parkingDetailId,
          `${fieldPrefix}${issue.databaseValue}`,
          `${fieldPrefix}${issue.websiteValue}`,
        ];
      })
    : [[email, 'PASSED', '', '', '']];

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}\r\n`;
}

function databaseRow(row: DatabaseParkingRow): ComparableRow {
  return {
    'Parking Detail ID': text(row['Parking Detail ID']),
    'Check Handwriting 2': booleanValue(row['Check Handwriting 2']),
    Address: text(row.Address),
    Counter: text(row.Counter),
    Customer: text(row.Customer),
    'Image Url': text(row['Image Url']),
    'Mall Name': text(row['Mall Name']),
    'Merchant Name': text(row['Merchant Name']),
    Message: text(row.Message),
    'Receipt No': text(row['Receipt No']),
    Status: text(row.Status),
    Total: numericValue(row.Total),
    'Transaction Date': dateValue(row['Transaction Date']),
    'Transaction Time': timeValue(row['Transaction Time']),
    UID: text(row.UID),
    'Unit No': text(row['Unit No']),
    'Created User': text(row['Created User']),
  };
}

function websiteRow(
  row: ParkingTransaction,
  customerAccounts: Record<string, string | null>,
): ComparableRow {
  const customer = reference(row.customers);
  const createdBy = reference(row.createdBy);
  const customerDocumentId = text(customer?.value);

  return {
    'Parking Detail ID': text(row.cx_Name),
    'Check Handwriting 2': booleanValue(row.checkHandwriting2),
    Address: text(row.address),
    Counter: text(row.counter),
    Customer: text(customerAccounts[customerDocumentId]),
    'Image Url': text(row.imageUrl_02),
    'Mall Name': text(row.mallName),
    'Merchant Name': text(row.merchantName),
    Message: text(row.message),
    'Receipt No': text(row.receiptNo),
    Status: text(row.status),
    Total: numericValue(row.total),
    'Transaction Date': dateValue(row.transactionDate),
    'Transaction Time': timeValue(row.transactionTime),
    UID: text(row.uid),
    'Unit No': text(row.unitNo),
    'Created User': text(createdBy?.label),
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

function booleanValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const normalized = text(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') return 'TRUE';
  if (normalized === 'false' || normalized === '0') return 'FALSE';
  return text(value);
}

function numericValue(value: unknown): string {
  const normalized = text(value);
  if (normalized === '') return '';
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : normalized;
}

function dateValue(value: unknown): string {
  const seconds = firestoreSeconds(value);
  if (seconds !== undefined) return bangkokDate(new Date(seconds * 1_000));
  if (value instanceof Date) return bangkokDate(value);
  const normalized = text(value);
  return normalized.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? normalized;
}

function timeValue(value: unknown): string {
  const seconds = firestoreSeconds(value);
  if (seconds !== undefined) {
    const secondsInDay = ((seconds % 86_400) + 86_400) % 86_400;
    return [
      Math.floor(secondsInDay / 3_600),
      Math.floor((secondsInDay % 3_600) / 60),
      secondsInDay % 60,
    ]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }
  const normalized = text(value);
  const match = normalized.match(/^(\d{2}:\d{2})(?::(\d{2}))?/);
  return match ? `${match[1]}:${match[2] ?? '00'}` : normalized;
}

function firestoreSeconds(value: unknown): number | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const seconds = (value as { _seconds?: unknown })._seconds;
  return typeof seconds === 'number' ? seconds : undefined;
}

function bangkokDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
