import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parkingEmailFromArgs } from './parking-test-data';
import type { BusRideSelection } from '../types/bus-ride';

export const BUS_RIDE_TEST_DATA_PATH = path.resolve(
  process.cwd(),
  'data/bus-ride-test-data.json',
);

export async function loadBusRideTestEmail(
  args: readonly string[] = process.argv.slice(2),
): Promise<string> {
  const commandLineEmail = parkingEmailFromArgs(args);
  if (commandLineEmail) return commandLineEmail;

  const content = await readFile(BUS_RIDE_TEST_DATA_PATH, 'utf8');
  const testData = JSON.parse(content) as { email?: unknown };
  if (typeof testData.email !== 'string' || testData.email.trim() === '') {
    throw new Error(`Set a valid email in ${BUS_RIDE_TEST_DATA_PATH}`);
  }
  return testData.email.trim().toLowerCase();
}

export async function loadBusRideSelection(
  args: readonly string[] = process.argv.slice(2),
): Promise<BusRideSelection> {
  const email = parkingEmailFromArgs(args);
  const routeName = argumentValue(args, '--route-name');
  if (email && routeName) {
    throw new Error('Use either --email or --route-name, not both');
  }
  if (routeName) return { mode: 'route', value: routeName };
  return { mode: 'email', value: email ?? await loadBusRideTestEmail(args) };
}

export function busRideSelectionArgs(selection: BusRideSelection): string[] {
  return [selection.mode === 'email' ? '--email' : '--route-name', selection.value];
}

export function busRideSelectionOutputKey(selection: BusRideSelection): string {
  const prefix = selection.mode === 'email' ? '' : 'route-';
  return `${prefix}${selection.value.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
}

export function busRideSelectionLabel(selection: BusRideSelection): string {
  return selection.mode === 'email' ? 'Email' : 'Route Name';
}

function argumentValue(args: readonly string[], flag: string): string | undefined {
  const flagIndex = args.indexOf(flag);
  const equalsArgument = args.find((argument) => argument.startsWith(`${flag}=`));
  const value = flagIndex >= 0
    ? args[flagIndex + 1]
    : equalsArgument?.slice(flag.length + 1);
  if (flagIndex >= 0 && (!value || value.startsWith('--'))) {
    throw new Error(`Provide a value after ${flag}`);
  }
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) throw new Error(`Provide a non-empty value for ${flag}`);
  return normalized;
}
