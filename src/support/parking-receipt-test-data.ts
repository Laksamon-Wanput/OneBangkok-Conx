import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parkingEmailFromArgs } from './parking-test-data';

export const PARKING_RECEIPT_TEST_DATA_PATH = path.resolve(
  process.cwd(),
  'data/parking-reciept-test-data.json',
);

export async function loadParkingReceiptTestEmail(
  args: readonly string[] = process.argv.slice(2),
): Promise<string> {
  const commandLineEmail = parkingEmailFromArgs(args);
  if (commandLineEmail) return commandLineEmail;

  const content = await readFile(PARKING_RECEIPT_TEST_DATA_PATH, 'utf8');
  const testData = JSON.parse(content) as { email?: unknown };

  if (typeof testData.email !== 'string' || testData.email.trim() === '') {
    throw new Error(`Set a valid email in ${PARKING_RECEIPT_TEST_DATA_PATH}`);
  }

  return testData.email.trim().toLowerCase();
}
