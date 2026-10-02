import type { ConxReference } from '../types/parking-transaction';
import type { ParkingReceiptItem } from '../types/parking-receipt-item';

const CSV_HEADERS = [
  'email',
  'documentId',
  'parkingReceiptItemName',
  'parkingTransaction',
  'customer',
  'description',
  'quantity',
  'totalPrice',
] as const;

type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

export function toParkingReceiptItemsCsv(
  email: string,
  items: ParkingReceiptItem[],
  customerAccountByItemDocumentId: Record<string, string | null>,
): string {
  const rows = items.map((item) => toCsvRow(email, item, customerAccountByItemDocumentId));
  const lines = [
    CSV_HEADERS.map(csvCell).join(','),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvCell(row[header])).join(',')),
  ];

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function toCsvRow(
  email: string,
  item: ParkingReceiptItem,
  customerAccountByItemDocumentId: Record<string, string | null>,
): CsvRow {
  const parkingTransaction = reference(item.parkingTransaction);

  return {
    email,
    documentId: text(item._docId),
    parkingReceiptItemName: text(item.cx_Name),
    parkingTransaction: text(parkingTransaction?.label),
    customer: text(customerAccountByItemDocumentId[item._docId]),
    description: text(item.description),
    quantity: text(item.quantity),
    totalPrice: text(item.totalPrice),
  };
}

function reference(value: unknown): ConxReference | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ConxReference)
    : undefined;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value).trim();
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
