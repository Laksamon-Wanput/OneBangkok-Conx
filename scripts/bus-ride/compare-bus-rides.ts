import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  busRideComparisonReportCsv,
  compareBusRides,
} from '../../src/support/bus-ride-comparison';
import {
  busRideSelectionOutputKey,
  loadBusRideSelection,
} from '../../src/support/bus-ride-test-data';
import type {
  BusRideSelection,
  BusRideSourceExport,
  BusRideWebsiteExport,
} from '../../src/types/bus-ride';

async function main(): Promise<void> {
  const selection = await loadBusRideSelection();
  const outputDirectory = path.resolve(
    process.cwd(),
    process.env.PARKING_OUTPUT_DIR ?? './output',
  );
  const outputKey = busRideSelectionOutputKey(selection);
  const websiteExport = await readJson<BusRideWebsiteExport>(
    path.join(outputDirectory, `bus-rides-${outputKey}.json`),
    selection,
  );
  const sourceExport = await readJson<BusRideSourceExport>(
    path.join(outputDirectory, `bus-rides-database-${outputKey}.json`),
    selection,
  );
  const result = compareBusRides(selection.value, sourceExport, websiteExport);
  const reportPath = path.join(
    outputDirectory,
    `bus-ride-comparison-report-${outputKey}.csv`,
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(reportPath, busRideComparisonReportCsv(selection, result), 'utf8');

  console.log(`Database rows: ${result.databaseRowCount}`);
  console.log(`Website rows: ${result.websiteRowCount}`);
  console.log(`Differences: ${result.issues.length}`);
  console.log(`Result: ${result.issues.length === 0 ? 'PASSED' : 'FAILED'}`);
  console.log(`Report: ${reportPath}`);
  if (result.issues.length > 0) process.exitCode = 1;
}

async function readJson<T extends { selection?: BusRideSelection }>(
  filePath: string,
  selection: BusRideSelection,
): Promise<T> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    throw new Error(`Required input not found: ${filePath}. Run the full Bus Ride flow first.`);
  }
  const data = JSON.parse(content) as T;
  if (data.selection?.mode !== selection.mode || data.selection.value !== selection.value) {
    throw new Error(`Input selection does not match requested ${selection.mode} in ${filePath}`);
  }
  return data;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
