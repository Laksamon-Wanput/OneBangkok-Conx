import type { ConxReference, ParkingTransaction } from '../types/parking-transaction';

const CSV_HEADERS = [
  'email',
  'customerDocumentId',
  'customerLabel',
  'documentId',
  'parkingDetailId',
  'checkHandwriting2',
  'address',
  'counter',
  'imageUrl',
  'mallName',
  'merchantName',
  'message',
  'receiptNo',
  'status',
  'total',
  'transactionDate',
  'transactionTime',
  'uid',
  'unitNo',
  'createdUser',
  'createdUserId',
] as const;

type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

export function toParkingTransactionsCsv(
  email: string,
  transactions: ParkingTransaction[],
): string {
  const rows = transactions.map((transaction) => toCsvRow(email, transaction));
  const lines = [
    CSV_HEADERS.map(csvCell).join(','),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvCell(row[header])).join(',')),
  ];

  // UTF-8 BOM ช่วยให้ Microsoft Excel แสดงภาษาไทยได้ถูกต้อง
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function toCsvRow(email: string, transaction: ParkingTransaction): CsvRow {
  const customer = asReference(transaction.customers);
  const createdBy = asReference(transaction.createdBy);

  return {
    email,
    customerDocumentId: stringValue(customer?.value),
    customerLabel: stringValue(customer?.label),
    documentId: stringValue(transaction._docId),
    parkingDetailId: stringValue(transaction.cx_Name),
    checkHandwriting2: stringValue(transaction.checkHandwriting2),
    address: stringValue(transaction.address),
    counter: stringValue(transaction.counter),
    imageUrl: stringValue(transaction.imageUrl_02),
    mallName: stringValue(transaction.mallName),
    merchantName: stringValue(transaction.merchantName),
    message: stringValue(transaction.message),
    receiptNo: stringValue(transaction.receiptNo),
    status: stringValue(transaction.status),
    total: stringValue(transaction.total),
    transactionDate: firestoreDate(transaction.transactionDate),
    transactionTime: firestoreTime(transaction.transactionTime),
    uid: stringValue(transaction.uid),
    unitNo: stringValue(transaction.unitNo),
    createdUser: stringValue(createdBy?.label),
    createdUserId: stringValue(createdBy?.value),
  };
}

function asReference(value: unknown): ConxReference | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ConxReference)
    : undefined;
}

function firestoreDate(value: unknown): string {
  const seconds = firestoreSeconds(value);
  if (seconds === undefined) {
    return stringValue(value);
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(seconds * 1_000));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function firestoreTime(value: unknown): string {
  const seconds = firestoreSeconds(value);
  if (seconds === undefined) {
    return stringValue(value);
  }

  const secondsInDay = ((seconds % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(secondsInDay / 3_600);
  const minutes = Math.floor((secondsInDay % 3_600) / 60);
  const remainingSeconds = secondsInDay % 60;

  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function firestoreSeconds(value: unknown): number | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  const seconds = (value as { _seconds?: unknown })._seconds;
  return typeof seconds === 'number' ? seconds : undefined;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
