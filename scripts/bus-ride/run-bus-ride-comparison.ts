import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  busRideSelectionArgs,
  busRideSelectionLabel,
  loadBusRideSelection,
} from '../../src/support/bus-ride-test-data';

async function main(): Promise<void> {
  const selection = await loadBusRideSelection();
  console.log(`${busRideSelectionLabel(selection)} used for every Bus Ride step: ${selection.value}`);
  if (selection.busShift) {
    console.log(`Bus shift used for every Bus Ride step: ${selection.busShift}`);
  }

  const steps = [
    ['Step 1: Bus Ride Website fetch', 'get-bus-rides.ts'],
    ['Step 2: IAM account lookup and passenger boarding fetch', 'get-bus-rides-from-database.ts'],
    ['Step 3: Bus Ride comparison report', 'compare-bus-rides.ts'],
  ] as const;

  for (const [label, scriptName] of steps) {
    const exitCode = await runScript(label, scriptName, busRideSelectionArgs(selection));
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      return;
    }
  }
}

async function runScript(
  label: string,
  scriptName: string,
  selectionArgs: string[],
): Promise<number> {
  console.log(`\n${label}`);
  const tsxPath = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'bus-ride', scriptName);
  return new Promise((resolve, reject) => {
    const child = spawn(tsxPath, [scriptPath, ...selectionArgs], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${label} stopped by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
