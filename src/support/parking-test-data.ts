import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const PARKING_TEST_DATA_PATH = path.resolve(
  process.cwd(),
  'data/parking-transection-test-data.json',
);

export async function loadParkingTestEmail(
  args: readonly string[] = process.argv.slice(2),
): Promise<string> {
  const commandLineEmail = parkingEmailFromArgs(args);
  if (commandLineEmail) return commandLineEmail;

  const content = await readFile(PARKING_TEST_DATA_PATH, 'utf8');
  const testData = JSON.parse(content) as { email?: unknown };

  if (typeof testData.email !== 'string' || testData.email.trim() === '') {
    throw new Error(`Set a valid email in ${PARKING_TEST_DATA_PATH}`);
  }

  return testData.email.trim().toLowerCase();
}

export function parkingEmailFromArgs(args: readonly string[]): string | undefined {
  const emailFlagIndex = args.indexOf('--email');
  const equalsArgument = args.find((argument) => argument.startsWith('--email='));
  const value = emailFlagIndex >= 0
    ? args[emailFlagIndex + 1]
    : equalsArgument?.slice('--email='.length);

  if (emailFlagIndex >= 0 && (!value || value.startsWith('--'))) {
    throw new Error('Provide an email after --email');
  }
  if (value === undefined) return undefined;

  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email provided with --email: ${value}`);
  }
  return email;
}
