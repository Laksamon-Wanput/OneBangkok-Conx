import type { ConxReference } from './parking-transaction';

export type ParkingReceiptItem = {
  _docId: string;
  cx_Name?: string;
  customers?: ConxReference | null;
  parkingTransaction?: ConxReference | null;
  description?: string | null;
  quantity?: string | number | null;
  totalPrice?: string | number | null;
  [key: string]: unknown;
};

export type ParkingReceiptItemExport = {
  email: string;
  customerDocumentIds: string[];
  customerAccountByItemDocumentId: Record<string, string | null>;
  fetchedAt: string;
  count: number;
  items: ParkingReceiptItem[];
};
