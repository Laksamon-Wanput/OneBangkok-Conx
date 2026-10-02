import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadParkingReceiptTestEmail } from '../../src/support/parking-receipt-test-data';

async function main(): Promise<void> {
  const email = await loadParkingReceiptTestEmail();
  console.log(`Email used for Step 1 and Step 2: ${email}`);

  const fetchExitCode = await runScript(
    'Step 1: Parking Receipt Item Website fetch',
    'get-parking-receipt-items.ts',
    email,
  );
  if (fetchExitCode !== 0) {
    process.exitCode = fetchExitCode;
    return;
  }

  process.exitCode = await runScript(
    'Step 2: Parking Receipt Item Database comparison',
    'compare-parking-receipt-items.ts',
    email,
  );
}

async function runScript(
  label: string,
  scriptName: string,
  email: string,
): Promise<number> {
  console.log(`\n${label}`);
  const tsxPath = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
  const scriptPath = path.resolve(
    process.cwd(),
    'scripts',
    'parking-reciept',
    scriptName,
  );

  return new Promise((resolve, reject) => {
    const child = spawn(tsxPath, [scriptPath, '--email', email], {
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
