import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  compareParkingTransactions,
  comparisonReportCsv,
} from '../../src/support/parking-comparison';
import { queryParkingTransactions } from '../../src/support/parking-database';
import { loadParkingTestEmail } from '../../src/support/parking-test-data';
import type { ParkingTransactionExport } from '../../src/types/parking-transaction';

async function main(): Promise<void> {
  const email = await loadParkingTestEmail();
  const connectionString = requiredEnv('IAM_DATABASE_URL');
  const outputDirectory = path.resolve(
    process.cwd(),
    process.env.PARKING_OUTPUT_DIR ?? './output',
  );
  const safeEmail = safeFileName(email);
  const websitePath = path.join(
    outputDirectory,
    `parking-transactions-${safeEmail}.json`,
  );

  const websiteExport = await loadWebsiteExport(websitePath, email);
  const databaseRows = await queryParkingTransactions(connectionString, email);
  const comparison = compareParkingTransactions(email, databaseRows, websiteExport);
  const reportPath = path.join(
    outputDirectory,
    `parking-comparison-report-${safeEmail}.csv`,
  );

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(reportPath, comparisonReportCsv(email, comparison), 'utf8');

  console.log(`Database rows: ${comparison.databaseRowCount}`);
  console.log(`Website rows: ${comparison.websiteRowCount}`);
  console.log(`Differences: ${comparison.issues.length}`);
  console.log(`Result: ${comparison.issues.length === 0 ? 'PASSED' : 'FAILED'}`);
  console.log(`Report: ${reportPath}`);

  if (comparison.issues.length > 0) process.exitCode = 1;
}

async function loadWebsiteExport(
  websitePath: string,
  email: string,
): Promise<ParkingTransactionExport> {
  let content: string;
  try {
    content = await readFile(websitePath, 'utf8');
  } catch {
    throw new Error(
      `Website result not found at ${websitePath}. Run npm run parking:fetch first.`,
    );
  }

  const data = JSON.parse(content) as ParkingTransactionExport;
  if (data.email?.trim().toLowerCase() !== email) {
    throw new Error(
      `Website result email does not match test data: ${data.email ?? '(missing)'}`,
    );
  }
  if (!data.customerAccountsByDocumentId) {
    throw new Error('Website result is missing customer account mapping. Run npm run parking:fetch again.');
  }
  return data;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]/g, '_');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
