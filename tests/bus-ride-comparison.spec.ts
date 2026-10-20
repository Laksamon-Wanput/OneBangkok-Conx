import { expect, test } from '@playwright/test';
import {
  busRideComparisonReportCsv,
  compareBusRides,
} from '../src/support/bus-ride-comparison';
import type {
  BusRideSourceExport,
  BusRideWebsiteExport,
} from '../src/types/bus-ride';

const sourceExport: BusRideSourceExport = {
  selection: { mode: 'email', value: 'customer@example.com' },
  accountIds: ['account-1'],
  fetchedAt: '2026-09-30T00:00:00.000Z',
  count: 1,
  rides: [{
    'Boarding Location': 'location-1',
    'Boarding Time': '2026-09-30 01:02:03.000Z',
    'Bus Reference': 'Bus 1',
    'Bus shift': '08:00',
    'Created User': 'account-1',
    'Created Date': '2026-09-30T01:02:04.999Z',
    Customer: 'account-1',
    'Event Id': 'event-1',
    'Last Modified': '2026-09-30T01:02:05Z',
    'Modified User': 'API User',
    'Route Name': 'Route 1',
    'Scan Failure Reason': '',
    'Scan Status': 'success',
    'Tenant name': 'Tenant A',
  }],
};

const websiteExport: BusRideWebsiteExport = {
  selection: { mode: 'email', value: 'customer@example.com' },
  customerDocumentIds: ['customer-doc-1'],
  customerAccountByRideDocumentId: { 'ride-doc-1': 'account-1' },
  fetchedAt: '2026-09-30T00:00:00.000Z',
  count: 1,
  rides: [{
    _docId: 'ride-doc-1',
    cx_Name: 'event-1',
    boardingLocation: 'location-1',
    boardingTime: { _seconds: 1_790_730_123 },
    busReference: 'Bus 1',
    busShift: '08:00',
    createdBy: { label: 'API User', value: 'user-1' },
    createdDate: { _seconds: 1_790_730_124 },
    customers: { label: 'Customer', value: 'customer-doc-1' },
    lastModified: { _seconds: 1_790_730_125 },
    modifiedBy: { label: 'API User', value: 'user-1' },
    routeName: 'Route 1',
    scanFailureReason: '',
    scanStatus: { label: 'Success', value: 'success' },
    tenantName: 'Tenant A',
  }],
};

test('passes when normalized Bus Ride rows match', () => {
  const result = compareBusRides('customer@example.com', sourceExport, websiteExport);
  expect(result.issues).toEqual([]);
  const csv = busRideComparisonReportCsv(sourceExport.selection, result);
  expect(csv).toContain('"PASSED"');
  expect(csv.split('\r\n')[0]).toBe(
    '\uFEFF"Email","Result","Event Id","Different Fields","Database Value"',
  );
});

test('reports Bus Ride mismatches with the field name in value columns', () => {
  const changedSource: BusRideSourceExport = {
    ...sourceExport,
    rides: [{ ...sourceExport.rides[0], 'Route Name': 'Route 2' }],
  };
  const result = compareBusRides('customer@example.com', changedSource, websiteExport);
  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ result: 'FIELD_MISMATCH', field: 'Route Name' }),
  ]));
  const csv = busRideComparisonReportCsv(sourceExport.selection, result);
  expect(csv).toContain('"Route Name: Route 2"');
  expect(csv).toContain('"Route Name: Route 1"');
  expect(csv).toContain('"Website Value"');
  expect(csv).toContain('"Route Name"');
  expect(csv).not.toContain('"Occurrence"');
  expect(csv).not.toContain('"Field"');
});

test('groups every field mismatch for the same Event Id into one CSV row', () => {
  const changedSource: BusRideSourceExport = {
    ...sourceExport,
    rides: [{
      ...sourceExport.rides[0],
      'Boarding Location': 'Database Location',
      'Route Name': 'Database Route',
      'Created Date': '2026-09-30T02:03:04Z',
    }],
  };

  const result = compareBusRides('customer@example.com', changedSource, websiteExport);
  expect(result.issues).toHaveLength(1);
  expect(result.issues[0]).toMatchObject({
    result: 'FIELD_MISMATCH',
    eventId: 'event-1',
    field: '(multiple)',
    differentFields: ['Boarding Location', 'Created Date', 'Route Name'],
  });

  const csv = busRideComparisonReportCsv(sourceExport.selection, result);
  expect(csv.trim().split('\r\n')).toHaveLength(4);
  expect(csv).toContain('"Boarding Location | Created Date | Route Name"');
  expect(csv).toContain('Boarding Location: Database Location | Created Date: 2026-09-30T02 | Route Name: Database Route');
  expect(csv).toContain('Boarding Location: location-1 | Created Date: 2026-09-30T01 | Route Name: Route 1');
});

test('ignores Last Modified, Modified User, and Created Date values below the hour', () => {
  const changedSource: BusRideSourceExport = {
    ...sourceExport,
    rides: [{
      ...sourceExport.rides[0],
      'Created Date': '2026-09-30T01:02:04.123Z',
      'Last Modified': 'different timestamp',
      'Modified User': 'different user',
    }],
  };

  const result = compareBusRides('customer@example.com', changedSource, websiteExport);
  expect(result.issues).toEqual([]);
});

test('adds seven hours to Database Boarding Time and compares Created Date by hour', () => {
  const actualSource: BusRideSourceExport = {
    ...sourceExport,
    rides: [{
      ...sourceExport.rides[0],
      'Boarding Time': '2026-10-12 07:48:43',
      'Created Date': '2026-10-12T07:48:45Z',
    }],
  };
  const actualWebsite: BusRideWebsiteExport = {
    ...websiteExport,
    rides: [{
      ...websiteExport.rides[0],
      boardingTime: '2026-10-12T07:48:43Z',
      createdDate: '2026-10-12T07:49:00Z',
    }],
  };

  const result = compareBusRides('customer@example.com', actualSource, actualWebsite);
  expect(result.issues).toEqual([]);
});

test('uses Route Name as the first report column in route mode', () => {
  const result = compareBusRides(
    'Mtel (Office) - Lunch Canteen',
    sourceExport,
    websiteExport,
  );
  const csv = busRideComparisonReportCsv({
    mode: 'route',
    value: 'Mtel (Office) - Lunch Canteen',
  }, result);

  expect(csv.split('\r\n')[0]).toBe(
    '\uFEFF"Route Name","Result","Event Id","Different Fields","Database Value"',
  );
  expect(csv).toContain('"Mtel (Office) - Lunch Canteen","PASSED"');
});

test('compares Database scan_failure_reason with Website Scan Failure Reason', () => {
  const failedSource: BusRideSourceExport = {
    ...sourceExport,
    rides: [{
      ...sourceExport.rides[0],
      'Scan Status': 'failed',
      'Scan Failure Reason': 'INVALID_QR',
    }],
  };
  const failedWebsite: BusRideWebsiteExport = {
    ...websiteExport,
    rides: [{
      ...websiteExport.rides[0],
      scanStatus: { label: 'Failed', value: 'failed' },
      scanFailureReason: 'QR_EXPIRED',
    }],
  };

  const result = compareBusRides('Route A', failedSource, failedWebsite);
  expect(result.issues).toHaveLength(1);
  expect(result.issues[0]).toMatchObject({
    field: 'Scan Failure Reason',
    databaseValue: 'INVALID_QR',
    websiteValue: 'QR_EXPIRED',
  });
});
