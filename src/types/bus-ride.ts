import type { ConxReference } from './parking-transaction';

export type BusRideSelection = (
  | { mode: 'email'; value: string }
  | { mode: 'route'; value: string }
) & { busShift?: string };

export type BusRide = {
  _docId: string;
  cx_Name?: string | null;
  boardingLocation?: string | null;
  boardingTime?: unknown;
  busReference?: string | null;
  busShift?: string | null;
  createdBy?: ConxReference | null;
  createdDate?: unknown;
  customers?: ConxReference | null;
  lastModified?: unknown;
  modifiedBy?: ConxReference | null;
  routeName?: string | null;
  scanFailureReason?: string | null;
  scanStatus?: ConxReference | string | null;
  tenantName?: string | null;
  [key: string]: unknown;
};

export type BusRideWebsiteExport = {
  selection: BusRideSelection;
  customerDocumentIds: string[];
  customerAccountByRideDocumentId: Record<string, string | null>;
  fetchedAt: string;
  count: number;
  rides: BusRide[];
};

export type BusRideSourceRow = {
  'Boarding Location': unknown;
  'Boarding Time': unknown;
  'Bus Reference': unknown;
  'Bus shift': unknown;
  'Created User': unknown;
  'Created Date': unknown;
  Customer: unknown;
  'Event Id': unknown;
  'Last Modified': unknown;
  'Modified User': unknown;
  'Route Name': unknown;
  'Scan Failure Reason': unknown;
  'Scan Status': unknown;
  'Tenant name': unknown;
};

export type BusRideSourceExport = {
  selection: BusRideSelection;
  accountIds: string[];
  fetchedAt: string;
  count: number;
  rides: BusRideSourceRow[];
};
