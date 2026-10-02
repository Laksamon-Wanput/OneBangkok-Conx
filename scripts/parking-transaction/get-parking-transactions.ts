import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  chromium,
  type APIResponse,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import { toParkingTransactionsCsv } from '../../src/support/parking-csv';
import { loadParkingTestEmail } from '../../src/support/parking-test-data';
import type {
  ConxCustomer,
  ParkingTransaction,
  ParkingTransactionExport,
} from '../../src/types/parking-transaction';

const PARKING_PATH = '/object/parkingTransaction';
const API_PAGE_SIZE = 100;

async function main(): Promise<void> {
  const baseUrl = requiredEnv('CONX_BASE_URL').replace(/\/$/, '');
  const username = requiredEnv('CONX_USERNAME');
  const password = requiredEnv('CONX_PASSWORD');
  const targetEmail = await loadParkingTestEmail();
  const outputDirectory = path.resolve(
    process.cwd(),
    process.env.PARKING_OUTPUT_DIR ?? './output',
  );
  const headed = process.argv.includes('--headed');

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Signing in to Conx...');
    const initialParkingResponse = await login(page, baseUrl, username, password);
    console.log('Authenticated Parking Transaction request captured.');
    const headers = await reusableHeaders(initialParkingResponse.request());
    const customers = await fetchCustomersByEmail(
      page,
      initialParkingResponse,
      headers,
      targetEmail,
    );
    const customerDocumentIds = new Set(
      customers
        .filter((customer) => customer.cx_email?.trim().toLowerCase() === targetEmail)
        .map((customer) => customer._docId),
    );
    const customerAccountsByDocumentId = Object.fromEntries(
      customers
        .filter((customer) => customer.cx_email?.trim().toLowerCase() === targetEmail)
        .map((customer) => [customer._docId, customer.accountId ?? null]),
    );

    if (customerDocumentIds.size === 0) {
      throw new Error(`Customer not found for email: ${targetEmail}`);
    }

    const transactions = await fetchAllParkingTransactions(
      page,
      initialParkingResponse,
      headers,
    );
    const matchedTransactions = transactions.filter((transaction) => {
      const customerId = transaction.customers?.value;
      return typeof customerId === 'string' && customerDocumentIds.has(customerId);
    });

    const exported: ParkingTransactionExport = {
      email: targetEmail,
      customerDocumentIds: [...customerDocumentIds],
      customerAccountsByDocumentId,
      fetchedAt: new Date().toISOString(),
      count: matchedTransactions.length,
      transactions: matchedTransactions,
    };

    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(
      outputDirectory,
      `parking-transactions-${safeFileName(targetEmail)}.json`,
    );
    const csvOutputPath = path.join(
      outputDirectory,
      `parking-transactions-${safeFileName(targetEmail)}.csv`,
    );
    await Promise.all([
      writeFile(outputPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8'),
      writeFile(
        csvOutputPath,
        toParkingTransactionsCsv(targetEmail, matchedTransactions),
        'utf8',
      ),
    ]);

    console.log(`Customer records found: ${customerDocumentIds.size}`);
    console.log(`Parking transactions found: ${matchedTransactions.length}`);
    console.log(`JSON output: ${outputPath}`);
    console.log(`CSV output: ${csvOutputPath}`);
  } catch (error) {
    await mkdir(outputDirectory, { recursive: true });
    await page
      .screenshot({
        path: path.join(outputDirectory, 'parking-fetch-error.png'),
        fullPage: true,
      })
      .catch(() => undefined);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function login(
  page: Page,
  baseUrl: string,
  username: string,
  password: string,
): Promise<Response> {
  await page.goto(`${baseUrl}${PARKING_PATH}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const usernameInput = page.locator('input[name="username"]');
  const parkingSearch = page.locator('#search-parkingTransaction');
  await Promise.race([
    usernameInput.waitFor({ state: 'visible', timeout: 60_000 }),
    parkingSearch.waitFor({ state: 'visible', timeout: 60_000 }),
  ]);

  if (await parkingSearch.isVisible()) {
    return reloadParkingAndCaptureResponse(page);
  }

  await usernameInput.fill(username);
  await page.locator('input[name="password"]').fill(password);

  let parkingResponse: Response | undefined;
  const captureParkingResponse = (response: Response): void => {
    if (isRecordsResponse(response, '/object/parkingTransaction/getRecords')) {
      parkingResponse = response;
    }
  };
  page.on('response', captureParkingResponse);

  const permissionResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/profile/getPermission') && response.ok(),
    { timeout: 60_000 },
  );

  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }),
    permissionResponse,
    page.getByRole('button', { name: 'SIGN IN', exact: true }).click(),
  ]);
  console.log('Conx sign-in completed.');

  // Conx writes the Firebase session after the first authenticated requests finish.
  // Navigating immediately can race that write and redirect back to /login.
  await page.waitForTimeout(10_000);
  console.log(`Parking response captured during sign-in: ${Boolean(parkingResponse)}`);

  if (!parkingResponse) {
    console.log('Reloading Parking Transaction to capture its data request...');
    const responsePromise = page.waitForResponse(
      (response) => isRecordsResponse(response, '/object/parkingTransaction/getRecords'),
      { timeout: 60_000 },
    );

    if (new URL(page.url()).pathname === PARKING_PATH) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    } else {
      await page.goto(`${baseUrl}${PARKING_PATH}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    }
    parkingResponse = await responsePromise;
  }

  await page.locator('#search-parkingTransaction').waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  page.off('response', captureParkingResponse);
  if (!parkingResponse) {
    throw new Error('Conx did not return the Parking Transaction records response');
  }
  assertBrowserResponse(parkingResponse, 'initial parking transaction request');
  return parkingResponse;
}

async function reloadParkingAndCaptureResponse(page: Page): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) => isRecordsResponse(response, '/object/parkingTransaction/getRecords'),
    { timeout: 60_000 },
  );

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  const response = await responsePromise;
  assertBrowserResponse(response, 'initial parking transaction request');
  return response;
}

async function fetchCustomersByEmail(
  page: Page,
  initialParkingResponse: Response,
  headers: Record<string, string>,
  email: string,
): Promise<ConxCustomer[]> {
  const apiBaseUrl = `${new URL(initialParkingResponse.url()).origin}/connectx/api`;
  const filtersResponse = await page.request.get(
    `${apiBaseUrl}/filter/customers/listView`,
    { headers, timeout: 60_000 },
  );
  console.log('Customer list-view filter response received.');
  assertApiResponse(filtersResponse, 'customer list-view filters');

  const filtersBody = (await filtersResponse.json()) as {
    result?: Array<{ docId?: string; id?: string; isMaster?: boolean }>;
  };
  const filters = filtersBody.result ?? [];
  const masterFilter = filters.find((filter) => filter.isMaster) ?? filters[0];
  const filterId = masterFilter?.docId ?? masterFilter?.id;

  if (!filterId) {
    throw new Error('Conx did not return a Customer list-view filter ID');
  }

  const response = await page.request.post(
    `${apiBaseUrl}/object/customers/getRecords`,
    {
      headers,
      data: {
        filterId,
        limit: 100,
        offset: 0,
        q: email,
        order: { id: 'lastModified', desc: true },
        where: '',
      },
      timeout: 60_000,
    },
  );
  console.log('Customer search response received.');

  assertApiResponse(response, 'customer search');
  return (await response.json()) as ConxCustomer[];
}

async function fetchAllParkingTransactions(
  page: Page,
  initialResponse: Response,
  headers: Record<string, string>,
): Promise<ParkingTransaction[]> {
  const request = initialResponse.request();
  const requestBody = request.postDataJSON() as Record<string, unknown>;
  const transactions: ParkingTransaction[] = [];

  for (let offset = 0; ; offset += API_PAGE_SIZE) {
    const response = await page.request.post(initialResponse.url(), {
      headers,
      data: {
        ...requestBody,
        limit: API_PAGE_SIZE,
        offset,
        q: '',
      },
      timeout: 60_000,
    });

    if (!response.ok()) {
      throw new Error(
        `Parking transaction request failed: ${response.status()} ${response.statusText()}`,
      );
    }

    const batch = (await response.json()) as ParkingTransaction[];
    transactions.push(...batch);

    if (batch.length < API_PAGE_SIZE) {
      break;
    }
  }

  return transactions;
}

function isRecordsResponse(response: Response, pathFragment: string): boolean {
  return (
    response.request().method() === 'POST' &&
    response.url().includes(pathFragment)
  );
}

async function reusableHeaders(request: Request): Promise<Record<string, string>> {
  const headers = await request.allHeaders();
  const blocked = new Set([
    'content-length',
    'cookie',
    'host',
    'origin',
    'referer',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
  ]);

  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !name.startsWith(':') && !blocked.has(name.toLowerCase()),
    ),
  );
}

function assertBrowserResponse(response: Response, action: string): void {
  if (!response.ok()) {
    throw new Error(
      `Conx ${action} failed: ${response.status()} ${response.statusText()}`,
    );
  }
}

function assertApiResponse(response: APIResponse, action: string): void {
  if (!response.ok()) {
    throw new Error(
      `Conx ${action} failed: ${response.status()} ${response.statusText()}`,
    );
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]/g, '_');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
