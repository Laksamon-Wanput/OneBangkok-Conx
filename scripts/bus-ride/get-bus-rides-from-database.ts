import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  iamConnectionStringFromEnvironment,
  queryAccountIdsByEmail,
} from '../../src/support/bus-ride-account-database';
import {
  busRideSelectionOutputKey,
  loadBusRideSelection,
} from '../../src/support/bus-ride-test-data';
import type {
  BusRideSelection,
  BusRideSourceExport,
  BusRideSourceRow,
} from '../../src/types/bus-ride';

async function main(): Promise<void> {
  const selection = await loadBusRideSelection();
  const accountIds = selection.mode === 'email'
    ? await accountIdsForEmail(selection.value)
    : [];
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'bus-ride-source-'));
  const rows: BusRideSourceRow[] = [];
  try {
    const searches: BusRideSelection[] = selection.mode === 'email'
      ? accountIds.map((accountId) => ({
          mode: 'email',
          value: accountId,
          busShift: selection.busShift,
        }))
      : [selection];
    for (const [index, search] of searches.entries()) {
      const outputPath = path.join(tempDirectory, `search-${index + 1}.json`);
      await runPassengerBoardingScript(search, outputPath);
      const content = await readFile(outputPath, 'utf8');
      const accountRows = JSON.parse(content) as BusRideSourceRow[];
      rows.push(...accountRows);
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  const exported: BusRideSourceExport = {
    selection,
    accountIds,
    fetchedAt: new Date().toISOString(),
    count: rows.length,
    rides: rows,
  };
  const outputDirectory = path.resolve(
    process.cwd(),
    process.env.PARKING_OUTPUT_DIR ?? './output',
  );
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(
    outputDirectory,
    `bus-rides-database-${busRideSelectionOutputKey(selection)}.json`,
  );
  await writeFile(outputPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8');

  console.log(`Passenger boarding records found: ${rows.length}`);
  console.log(`Database output: ${outputPath}`);
}

async function runPassengerBoardingScript(
  selection: BusRideSelection,
  outputPath: string,
): Promise<void> {
  const python = process.env.PYTHON_BIN ?? 'python3';
  const scriptPath = path.resolve(
    process.cwd(),
    'scripts',
    'bus-ride',
    'find_passenger_boardings.py',
  );
  const args = [
    scriptPath,
    selection.mode === 'email' ? '--account-id' : '--route-name',
    selection.value,
    '--format',
    'json',
    '--output',
    outputPath,
  ];
  if (selection.busShift) {
    args.push('--bus-shift', selection.busShift);
  }
  if (process.env.CONX_USERNAME) {
    args.push('--modified-user', process.env.CONX_USERNAME);
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: path.dirname(scriptPath),
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Passenger boarding script stopped by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Passenger boarding script failed with exit code ${exitCode}`);
  }
}

async function accountIdsForEmail(email: string): Promise<string[]> {
  const connectionString = iamConnectionStringFromEnvironment();
  const accountIds = await queryAccountIdsByEmail(connectionString, email);
  if (accountIds.length === 0) {
    throw new Error(`IAM account_id not found for email: ${email}`);
  }
  console.log(`IAM account IDs found: ${accountIds.length}`);
  return accountIds;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
