import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  compareParkingReceiptItems,
  parkingReceiptItemComparisonReportCsv,
} from '../../src/support/parking-receipt-item-comparison';
import { queryParkingReceiptItems } from '../../src/support/parking-receipt-item-database';
import { loadParkingReceiptTestEmail } from '../../src/support/parking-receipt-test-data';
import type { ParkingReceiptItemExport } from '../../src/types/parking-receipt-item';

async function main(): Promise<void> {
  const email = await loadParkingReceiptTestEmail();
  const connectionString = requiredEnv('IAM_DATABASE_URL');
  const outputDirectory = path.resolve(
    process.cwd(),
    process.env.PARKING_OUTPUT_DIR ?? './output',
  );
  const safeEmail = safeFileName(email);
  const websitePath = path.join(
    outputDirectory,
    `parking-receipt-items-${safeEmail}.json`,
  );

  const websiteExport = await loadWebsiteExport(websitePath, email);
  const databaseRows = await queryParkingReceiptItems(connectionString, email);
  const comparison = compareParkingReceiptItems(email, databaseRows, websiteExport);
  const reportPath = path.join(
    outputDirectory,
    `parking-receipt-item-comparison-report-${safeEmail}.csv`,
  );

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    reportPath,
    parkingReceiptItemComparisonReportCsv(email, comparison),
    'utf8',
  );

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
): Promise<ParkingReceiptItemExport> {
  let content: string;
  try {
    content = await readFile(websitePath, 'utf8');
  } catch {
    throw new Error(
      `Website result not found at ${websitePath}. Run the Parking Receipt Item fetch first.`,
    );
  }

  const data = JSON.parse(content) as ParkingReceiptItemExport;
  if (data.email?.trim().toLowerCase() !== email) {
    throw new Error(
      `Website result email does not match test data: ${data.email ?? '(missing)'}`,
    );
  }
  if (!data.customerAccountByItemDocumentId) {
    throw new Error(
      'Website result is missing the customer account mapping. Run the fetch again.',
    );
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
