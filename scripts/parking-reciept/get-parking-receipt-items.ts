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
import { toParkingReceiptItemsCsv } from '../../src/support/parking-receipt-item-csv';
import { loadParkingReceiptTestEmail } from '../../src/support/parking-receipt-test-data';
import type {
  ParkingReceiptItem,
  ParkingReceiptItemExport,
} from '../../src/types/parking-receipt-item';
import type {
  ConxCustomer,
  ConxReference,
  ParkingTransaction,
} from '../../src/types/parking-transaction';

const PARKING_RECEIPT_ITEM_PATH = '/object/parkingReceiptItem';
const API_PAGE_SIZE = 100;

async function main(): Promise<void> {
  const baseUrl = requiredEnv('CONX_BASE_URL').replace(/\/$/, '');
  const username = requiredEnv('CONX_USERNAME');
  const password = requiredEnv('CONX_PASSWORD');
  const targetEmail = await loadParkingReceiptTestEmail();
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
    const initialItemResponse = await login(page, baseUrl, username, password);
    console.log('Authenticated Parking Receipt Item request captured.');
    const headers = await reusableHeaders(initialItemResponse.request());
    const apiBaseUrl = `${new URL(initialItemResponse.url()).origin}/connectx/api`;

    const customers = await fetchCustomersByEmail(
      page,
      apiBaseUrl,
      headers,
      targetEmail,
    );
    const matchingCustomers = customers.filter(
      (customer) => customer.cx_email?.trim().toLowerCase() === targetEmail,
    );
    const customerDocumentIds = new Set(
      matchingCustomers.map((customer) => customer._docId),
    );
    const customerAccountsByDocumentId = Object.fromEntries(
      matchingCustomers.map((customer) => [customer._docId, customer.accountId ?? null]),
    );

    if (customerDocumentIds.size === 0) {
      throw new Error(`Customer not found for email: ${targetEmail}`);
    }

    const [items, parkingTransactions] = await Promise.all([
      fetchAllParkingReceiptItems(page, initialItemResponse, headers),
      fetchAllObjectRecords<ParkingTransaction>(
        page,
        apiBaseUrl,
        headers,
        'parkingTransaction',
      ),
    ]);
    const matchingTransactions = parkingTransactions.filter((transaction) => {
      const customerId = reference(transaction.customers)?.value;
      return typeof customerId === 'string' && customerDocumentIds.has(customerId);
    });
    const transactionDocumentIds = new Set(
      matchingTransactions.map((transaction) => transaction._docId),
    );
    const transactionNames = new Set(
      matchingTransactions
        .map((transaction) => text(transaction.cx_Name))
        .filter(Boolean),
    );
    const accountByTransactionDocumentId = Object.fromEntries(
      matchingTransactions.map((transaction) => [
        transaction._docId,
        accountForCustomer(transaction.customers, customerAccountsByDocumentId),
      ]),
    );
    const accountByTransactionName = Object.fromEntries(
      matchingTransactions.map((transaction) => [
        text(transaction.cx_Name),
        accountForCustomer(transaction.customers, customerAccountsByDocumentId),
      ]),
    );

    const matchedItems = items.filter((item) => {
      const customerId = reference(item.customers)?.value;
      const parkingTransaction = reference(item.parkingTransaction);
      return (
        (typeof customerId === 'string' && customerDocumentIds.has(customerId)) ||
        (typeof parkingTransaction?.value === 'string' &&
          transactionDocumentIds.has(parkingTransaction.value)) ||
        (typeof parkingTransaction?.label === 'string' &&
          transactionNames.has(parkingTransaction.label))
      );
    });
    const customerAccountByItemDocumentId = Object.fromEntries(
      matchedItems.map((item) => {
        const customerId = reference(item.customers)?.value;
        const parkingTransaction = reference(item.parkingTransaction);
        const accountId =
          (typeof customerId === 'string'
            ? customerAccountsByDocumentId[customerId]
            : undefined) ??
          (typeof parkingTransaction?.value === 'string'
            ? accountByTransactionDocumentId[parkingTransaction.value]
            : undefined) ??
          (typeof parkingTransaction?.label === 'string'
            ? accountByTransactionName[parkingTransaction.label]
            : undefined) ??
          null;
        return [item._docId, accountId];
      }),
    );

    const exported: ParkingReceiptItemExport = {
      email: targetEmail,
      customerDocumentIds: [...customerDocumentIds],
      customerAccountByItemDocumentId,
      fetchedAt: new Date().toISOString(),
      count: matchedItems.length,
      items: matchedItems,
    };

    await mkdir(outputDirectory, { recursive: true });
    const safeEmail = safeFileName(targetEmail);
    const jsonOutputPath = path.join(
      outputDirectory,
      `parking-receipt-items-${safeEmail}.json`,
    );
    const csvOutputPath = path.join(
      outputDirectory,
      `parking-receipt-items-${safeEmail}.csv`,
    );
    await Promise.all([
      writeFile(jsonOutputPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8'),
      writeFile(
        csvOutputPath,
        toParkingReceiptItemsCsv(
          targetEmail,
          matchedItems,
          customerAccountByItemDocumentId,
        ),
        'utf8',
      ),
    ]);

    console.log(`Customer records found: ${customerDocumentIds.size}`);
    console.log(`Parking Receipt Items found: ${matchedItems.length}`);
    console.log(`JSON output: ${jsonOutputPath}`);
    console.log(`CSV output: ${csvOutputPath}`);
  } catch (error) {
    await mkdir(outputDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(outputDirectory, 'parking-receipt-item-fetch-error.png'),
      fullPage: true,
    }).catch(() => undefined);
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
  await page.goto(`${baseUrl}${PARKING_RECEIPT_ITEM_PATH}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const usernameInput = page.locator('input[name="username"]');
  const itemSearch = page.locator('#search-parkingReceiptItem');
  await Promise.race([
    usernameInput.waitFor({ state: 'visible', timeout: 60_000 }),
    itemSearch.waitFor({ state: 'visible', timeout: 60_000 }),
  ]);

  if (await itemSearch.isVisible()) {
    return reloadItemsAndCaptureResponse(page);
  }

  await usernameInput.fill(username);
  await page.locator('input[name="password"]').fill(password);

  let itemResponse: Response | undefined;
  const captureItemResponse = (response: Response): void => {
    if (isRecordsResponse(response, '/object/parkingReceiptItem/getRecords')) {
      itemResponse = response;
    }
  };
  page.on('response', captureItemResponse);

  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }),
    page.getByRole('button', { name: 'SIGN IN', exact: true }).click(),
  ]);
  console.log('Conx sign-in completed.');
  await page.waitForTimeout(10_000);

  if (!itemResponse) {
    const responsePromise = page.waitForResponse(
      (response) => isRecordsResponse(response, '/object/parkingReceiptItem/getRecords'),
      { timeout: 60_000 },
    );
    await page.goto(`${baseUrl}${PARKING_RECEIPT_ITEM_PATH}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    itemResponse = await responsePromise;
  }

  await itemSearch.waitFor({ state: 'visible', timeout: 60_000 });
  page.off('response', captureItemResponse);
  if (!itemResponse) {
    throw new Error('Conx did not return the Parking Receipt Item records response');
  }
  assertBrowserResponse(itemResponse, 'initial Parking Receipt Item request');
  return itemResponse;
}

async function reloadItemsAndCaptureResponse(page: Page): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) => isRecordsResponse(response, '/object/parkingReceiptItem/getRecords'),
    { timeout: 60_000 },
  );
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  const response = await responsePromise;
  assertBrowserResponse(response, 'initial Parking Receipt Item request');
  return response;
}

async function fetchCustomersByEmail(
  page: Page,
  apiBaseUrl: string,
  headers: Record<string, string>,
  email: string,
): Promise<ConxCustomer[]> {
  const filterId = await fetchMasterFilterId(page, apiBaseUrl, headers, 'customers');
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
  assertApiResponse(response, 'customer search');
  return (await response.json()) as ConxCustomer[];
}

async function fetchAllParkingReceiptItems(
  page: Page,
  initialResponse: Response,
  headers: Record<string, string>,
): Promise<ParkingReceiptItem[]> {
  const requestBody = initialResponse.request().postDataJSON() as Record<string, unknown>;
  const items: ParkingReceiptItem[] = [];

  for (let offset = 0; ; offset += API_PAGE_SIZE) {
    const response = await page.request.post(initialResponse.url(), {
      headers,
      data: { ...requestBody, limit: API_PAGE_SIZE, offset, q: '' },
      timeout: 60_000,
    });
    assertApiResponse(response, 'Parking Receipt Item request');
    const batch = (await response.json()) as ParkingReceiptItem[];
    items.push(...batch);
    if (batch.length < API_PAGE_SIZE) break;
  }
  return items;
}

async function fetchAllObjectRecords<T>(
  page: Page,
  apiBaseUrl: string,
  headers: Record<string, string>,
  objectName: string,
): Promise<T[]> {
  const filterId = await fetchMasterFilterId(page, apiBaseUrl, headers, objectName);
  const records: T[] = [];

  for (let offset = 0; ; offset += API_PAGE_SIZE) {
    const response = await page.request.post(
      `${apiBaseUrl}/object/${objectName}/getRecords`,
      {
        headers,
        data: {
          filterId,
          limit: API_PAGE_SIZE,
          offset,
          q: '',
          order: { id: 'lastModified', desc: true },
          where: '',
        },
        timeout: 60_000,
      },
    );
    assertApiResponse(response, `${objectName} request`);
    const batch = (await response.json()) as T[];
    records.push(...batch);
    if (batch.length < API_PAGE_SIZE) break;
  }
  return records;
}

async function fetchMasterFilterId(
  page: Page,
  apiBaseUrl: string,
  headers: Record<string, string>,
  objectName: string,
): Promise<string> {
  const response = await page.request.get(
    `${apiBaseUrl}/filter/${objectName}/listView`,
    { headers, timeout: 60_000 },
  );
  assertApiResponse(response, `${objectName} list-view filters`);
  const body = (await response.json()) as {
    result?: Array<{ docId?: string; id?: string; isMaster?: boolean }>;
  };
  const filters = body.result ?? [];
  const masterFilter = filters.find((filter) => filter.isMaster) ?? filters[0];
  const filterId = masterFilter?.docId ?? masterFilter?.id;
  if (!filterId) throw new Error(`Conx did not return a ${objectName} filter ID`);
  return filterId;
}

function accountForCustomer(
  customerValue: unknown,
  customerAccountsByDocumentId: Record<string, string | null>,
): string | null {
  const customerId = reference(customerValue)?.value;
  return typeof customerId === 'string'
    ? customerAccountsByDocumentId[customerId] ?? null
    : null;
}

function reference(value: unknown): ConxReference | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ConxReference)
    : undefined;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function isRecordsResponse(response: Response, pathFragment: string): boolean {
  return response.request().method() === 'POST' && response.url().includes(pathFragment);
}

async function reusableHeaders(request: Request): Promise<Record<string, string>> {
  const headers = await request.allHeaders();
  const blocked = new Set([
    'accept-encoding', 'content-length', 'cookie', 'host', 'origin', 'referer',
    'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site',
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !name.startsWith(':') && !blocked.has(name.toLowerCase()),
    ),
  );
}

function assertBrowserResponse(response: Response, label: string): void {
  if (!response.ok()) {
    throw new Error(`${label} failed: ${response.status()} ${response.statusText()}`);
  }
}

function assertApiResponse(response: APIResponse, label: string): void {
  if (!response.ok()) {
    throw new Error(`${label} failed: ${response.status()} ${response.statusText()}`);
  }
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
