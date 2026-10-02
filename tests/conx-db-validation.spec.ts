import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ConxPage } from '../src/pages/conx.page';
import { compareRecords } from '../src/support/compare-records';
import { getRecords } from '../src/support/database';
import type { ValidationFailure } from '../src/types/customer-record';

test.skip(
  process.env.RUN_DB_VALIDATION !== 'true',
  'Set RUN_DB_VALIDATION=true after configuring the DB adapter and Conx page locators.',
);

test('DB records match data displayed on Conx', async ({ page }, testInfo) => {
  const limit = Number(process.env.ROW_LIMIT ?? 1000);
  const records = await getRecords(limit);
  const conx = new ConxPage(page);
  const failures: ValidationFailure[] = [];

  await conx.login();

  for (const record of records) {
    await test.step(`validate ${record.email}`, async () => {
      try {
        const actual = await conx.findByEmail(record.email);

        if (!actual) {
          failures.push({
            id: record.id,
            email: record.email,
            reason: 'NOT_FOUND',
          });
          await captureFailure(page, testInfo.outputDir, record.id);
          return;
        }

        const differences = compareRecords(record, actual);
        if (Object.keys(differences).length > 0) {
          failures.push({
            id: record.id,
            email: record.email,
            reason: 'FIELD_MISMATCH',
            differences,
          });
          await captureFailure(page, testInfo.outputDir, record.id);
        }
      } catch (error) {
        failures.push({
          id: record.id,
          email: record.email,
          reason: 'CHECK_ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
        await captureFailure(page, testInfo.outputDir, record.id);
      }
    });
  }

  await mkdir(testInfo.outputDir, { recursive: true });
  const reportPath = path.join(testInfo.outputDir, 'validation-failures.json');
  await writeFile(reportPath, JSON.stringify(failures, null, 2), 'utf8');
  await testInfo.attach('validation-failures', {
    path: reportPath,
    contentType: 'application/json',
  });

  expect(
    failures,
    `Found ${failures.length} record(s) that do not match Conx. See validation-failures attachment.`,
  ).toEqual([]);
});

async function captureFailure(
  page: import('@playwright/test').Page,
  outputDir: string,
  recordId: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, `failed-${safeFileName(recordId)}.png`),
    fullPage: true,
  });
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}
