import type { ConxReference } from '../types/parking-transaction';
import type {
  BusRide,
  BusRideSelection,
  BusRideSourceExport,
  BusRideSourceRow,
  BusRideWebsiteExport,
} from '../types/bus-ride';

export const BUS_RIDE_FIELDS = [
  'Boarding Location',
  'Boarding Time',
  'Bus Reference',
  'Bus shift',
  'Created User',
  'Created Date',
  'Customer',
  'Event Id',
  'Route Name',
  'Scan Failure Reason',
  'Scan Status',
  'Tenant name',
] as const;

type BusRideField = (typeof BUS_RIDE_FIELDS)[number];
type ComparableRow = Record<BusRideField, string>;

export type BusRideComparisonIssue = {
  searchValue: string;
  result: 'FIELD_MISMATCH' | 'MISSING_ON_WEBSITE' | 'MISSING_IN_DATABASE';
  eventId: string;
  occurrence: number;
  field: BusRideField | '(row)' | '(multiple)';
  differentFields: BusRideField[];
  databaseValue: string;
  websiteValue: string;
};

export type BusRideComparisonResult = {
  databaseRowCount: number;
  websiteRowCount: number;
  issues: BusRideComparisonIssue[];
};

export function compareBusRides(
  searchValue: string,
  sourceExport: BusRideSourceExport,
  websiteExport: BusRideWebsiteExport,
): BusRideComparisonResult {
  const websiteGroups = new Map<string, ComparableRow[]>();
  for (const ride of websiteExport.rides) {
    const row = websiteRow(ride, websiteExport.customerAccountByRideDocumentId);
    const eventId = row['Event Id'];
    const group = websiteGroups.get(eventId) ?? [];
    group.push(row);
    websiteGroups.set(eventId, group);
  }

  const occurrences = new Map<string, number>();
  const issues: BusRideComparisonIssue[] = [];

  for (const sourceRecord of sourceExport.rides) {
    const database = sourceRow(sourceRecord);
    const eventId = database['Event Id'];
    const occurrence = (occurrences.get(eventId) ?? 0) + 1;
    occurrences.set(eventId, occurrence);
    const website = websiteGroups.get(eventId)?.shift();

    if (!website) {
      issues.push({
        searchValue,
        result: 'MISSING_ON_WEBSITE',
        eventId,
        occurrence,
        field: '(row)',
        differentFields: [],
        databaseValue: JSON.stringify(database),
        websiteValue: '',
      });
      continue;
    }

    const mismatches = BUS_RIDE_FIELDS.filter(
      (field) => database[field] !== website[field],
    );
    if (mismatches.length === 1) {
      const [field] = mismatches;
      issues.push({
        searchValue,
        result: 'FIELD_MISMATCH',
        eventId,
        occurrence,
        field,
        differentFields: [field],
        databaseValue: database[field],
        websiteValue: website[field],
      });
    } else if (mismatches.length > 1) {
      issues.push({
        searchValue,
        result: 'FIELD_MISMATCH',
        eventId,
        occurrence,
        field: '(multiple)',
        differentFields: mismatches,
        databaseValue: mismatches
          .map((field) => `${field}: ${database[field]}`)
          .join(' | '),
        websiteValue: mismatches
          .map((field) => `${field}: ${website[field]}`)
          .join(' | '),
      });
    }
  }

  for (const [eventId, rows] of websiteGroups) {
    for (const website of rows) {
      const occurrence = (occurrences.get(eventId) ?? 0) + 1;
      occurrences.set(eventId, occurrence);
      issues.push({
        searchValue,
        result: 'MISSING_IN_DATABASE',
        eventId,
        occurrence,
        field: '(row)',
        differentFields: [],
        databaseValue: '',
        websiteValue: JSON.stringify(website),
      });
    }
  }

  return {
    databaseRowCount: sourceExport.rides.length,
    websiteRowCount: websiteExport.rides.length,
    issues,
  };
}

export function busRideComparisonReportCsv(
  selection: BusRideSelection,
  result: BusRideComparisonResult,
): string {
  const headers = [
    selection.mode === 'email' ? 'Email' : 'Route Name',
    'Result',
    'Event Id',
    'Different Fields',
    'Database Value',
  ];
  const rows = result.issues.length
    ? result.issues.flatMap((issue) => {
        const fieldPrefix = issue.result === 'FIELD_MISMATCH'
          && issue.field !== '(multiple)'
          ? `${issue.field}: `
          : '';
        const databaseRow = [
          issue.searchValue,
          issue.result,
          issue.eventId,
          issue.differentFields.join(' | '),
          `${fieldPrefix}${issue.databaseValue}`,
        ];
        if (!issue.websiteValue) return [databaseRow];
        return [
          databaseRow,
          ['', '', '', '', 'Website Value'],
          ['', '', '', '', `${fieldPrefix}${issue.websiteValue}`],
        ];
      })
    : [[selection.value, 'PASSED', '', '', '']];

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}\r\n`;
}

export function websiteRow(
  ride: BusRide,
  customerAccountByRideDocumentId: Record<string, string | null>,
): ComparableRow {
  return {
    'Boarding Location': text(ride.boardingLocation),
    'Boarding Time': bangkokDateTimeValue(ride.boardingTime),
    'Bus Reference': text(ride.busReference),
    'Bus shift': text(ride.busShift),
    'Created User': text(customerAccountByRideDocumentId[ride._docId]),
    'Created Date': dateTimeHourValue(ride.createdDate),
    Customer: text(customerAccountByRideDocumentId[ride._docId]),
    'Event Id': text(ride.cx_Name),
    'Route Name': text(ride.routeName),
    'Scan Failure Reason': text(ride.scanFailureReason),
    'Scan Status': statusValue(ride.scanStatus),
    'Tenant name': text(ride.tenantName),
  };
}

function sourceRow(row: BusRideSourceRow): ComparableRow {
  return {
    'Boarding Location': text(row['Boarding Location']),
    'Boarding Time': sourceBangkokDateTimeValue(row['Boarding Time']),
    'Bus Reference': text(row['Bus Reference']),
    'Bus shift': text(row['Bus shift']),
    'Created User': text(row['Created User']),
    'Created Date': dateTimeHourValue(row['Created Date']),
    Customer: text(row.Customer),
    'Event Id': text(row['Event Id']),
    'Route Name': text(row['Route Name']),
    'Scan Failure Reason': text(row['Scan Failure Reason']),
    'Scan Status': statusValue(row['Scan Status']),
    'Tenant name': text(row['Tenant name']),
  };
}

function reference(value: unknown): ConxReference | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ConxReference)
    : undefined;
}

function statusValue(value: unknown): string {
  const normalized = reference(value)?.value ?? value;
  return text(normalized).toLowerCase();
}

function dateTimeHourValue(value: unknown): string {
  const seconds = firestoreSeconds(value);
  if (seconds !== undefined) return isoHour(new Date(seconds * 1_000));
  const normalized = text(value);
  if (!normalized) return '';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : isoHour(date);
}

function sourceBangkokDateTimeValue(value: unknown): string {
  const normalized = text(value);
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return normalized;
  const bangkokTime = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]) + 7,
    Number(match[5]),
    Number(match[6]),
  ));
  return utcWallClockDateTime(bangkokTime);
}

function bangkokDateTimeValue(value: unknown): string {
  const seconds = firestoreSeconds(value);
  const normalized = text(value);
  const date = seconds !== undefined
    ? new Date(seconds * 1_000)
    : new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function firestoreSeconds(value: unknown): number | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const seconds = (value as { _seconds?: unknown })._seconds;
  return typeof seconds === 'number' ? seconds : undefined;
}

function isoHour(value: Date): string {
  return value.toISOString().slice(0, 13);
}

function utcWallClockDateTime(value: Date): string {
  return value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '-') return '';
  return String(value).trim();
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
