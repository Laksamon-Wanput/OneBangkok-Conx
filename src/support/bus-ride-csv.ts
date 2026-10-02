import { BUS_RIDE_FIELDS, websiteRow } from './bus-ride-comparison';
import type { BusRide, BusRideSelection } from '../types/bus-ride';

export function toBusRidesCsv(
  selection: BusRideSelection,
  rides: BusRide[],
  customerAccountByRideDocumentId: Record<string, string | null>,
): string {
  const headers = [selection.mode === 'email' ? 'Email' : 'Route Name', ...BUS_RIDE_FIELDS];
  const rows = rides.map((ride) => {
    const row = websiteRow(ride, customerAccountByRideDocumentId);
    return [selection.value, ...BUS_RIDE_FIELDS.map((field) => row[field])];
  });

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}\r\n`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
