export type ConxReference = {
  label?: string;
  value?: string;
  [key: string]: unknown;
};

export type ConxCustomer = {
  _docId: string;
  accountId?: string | null;
  cx_email?: string;
  cx_Name?: string;
  [key: string]: unknown;
};

export type ParkingTransaction = {
  _docId: string;
  customers?: ConxReference | null;
  cx_Name?: string;
  status?: string;
  receiptNo?: string;
  [key: string]: unknown;
};

export type ParkingTransactionExport = {
  email: string;
  customerDocumentIds: string[];
  customerAccountsByDocumentId: Record<string, string | null>;
  fetchedAt: string;
  count: number;
  transactions: ParkingTransaction[];
};
