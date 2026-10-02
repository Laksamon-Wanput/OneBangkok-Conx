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
import { toBusRidesCsv } from '../../src/support/bus-ride-csv';
import {
  busRideSelectionOutputKey,
  loadBusRideSelection,
} from '../../src/support/bus-ride-test-data';
import type { BusRide, BusRideWebsiteExport } from '../../src/types/bus-ride';
import type { ConxCustomer, ConxReference } from '../../src/types/parking-transaction';

const BUS_RIDE_PATH = '/object/busRide';
const API_PAGE_SIZE = 100;

async function main(): Promise<void> {
  const baseUrl = requiredEnv('CONX_BASE_URL').replace(/\/$/, '');
  const username = requiredEnv('CONX_USERNAME');
  const password = requiredEnv('CONX_PASSWORD');
  const selection = await loadBusRideSelection();
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
    const initialResponse = await login(page, baseUrl, username, password);
    console.log('Authenticated Bus Ride request captured.');
    const headers = await reusableHeaders(initialResponse.request());
    const apiBaseUrl = `${new URL(initialResponse.url()).origin}/connectx/api`;
    const rides = await fetchAllBusRides(page, initialResponse, headers);
    let matchedRides: BusRide[];
    let matchingCustomers: ConxCustomer[];
    let customerDocumentIds: Set<string>;

    if (selection.mode === 'email') {
      const customers = await fetchCustomers(page, apiBaseUrl, headers, selection.value);
      matchingCustomers = customers.filter(
        (customer) => customer.cx_email?.trim().toLowerCase() === selection.value,
      );
      customerDocumentIds = new Set(
        matchingCustomers.map((customer) => customer._docId),
      );
      if (customerDocumentIds.size === 0) {
        throw new Error(`Customer not found for email: ${selection.value}`);
      }
      matchedRides = rides.filter((ride) => {
        const customerId = reference(ride.customers)?.value;
        return typeof customerId === 'string' && customerDocumentIds.has(customerId);
      });
    } else {
      const normalizedRoute = selection.value.trim().toLowerCase();
      matchedRides = rides.filter(
        (ride) => ride.routeName?.trim().toLowerCase() === normalizedRoute,
      );
      customerDocumentIds = new Set(
        matchedRides
          .map((ride) => reference(ride.customers)?.value)
          .filter((value): value is string => typeof value === 'string'),
      );
      const customerSearchTerms = new Map<string, string>();
      for (const ride of matchedRides) {
        const customer = reference(ride.customers);
        if (customer?.value) {
          customerSearchTerms.set(customer.value, customer.label || customer.value);
        }
      }
      const customerBatches = await Promise.all(
        [...customerSearchTerms.values()].map(
          (searchTerm) => fetchCustomers(page, apiBaseUrl, headers, searchTerm),
        ),
      );
      matchingCustomers = customerBatches
        .flat()
        .filter((customer) => customerDocumentIds.has(customer._docId));
    }

    const customerAccountsByDocumentId = Object.fromEntries(
      matchingCustomers.map((customer) => [customer._docId, customer.accountId ?? null]),
    );
    const customerAccountByRideDocumentId = Object.fromEntries(
      matchedRides.map((ride) => {
        const customerId = reference(ride.customers)?.value;
        const accountId = typeof customerId === 'string'
          ? customerAccountsByDocumentId[customerId] ?? null
          : null;
        return [ride._docId, accountId];
      }),
    );

    const exported: BusRideWebsiteExport = {
      selection,
      customerDocumentIds: [...customerDocumentIds],
      customerAccountByRideDocumentId,
      fetchedAt: new Date().toISOString(),
      count: matchedRides.length,
      rides: matchedRides,
    };
    await mkdir(outputDirectory, { recursive: true });
    const outputKey = busRideSelectionOutputKey(selection);
    const jsonPath = path.join(outputDirectory, `bus-rides-${outputKey}.json`);
    const csvPath = path.join(outputDirectory, `bus-rides-${outputKey}.csv`);
    await Promise.all([
      writeFile(jsonPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8'),
      writeFile(
        csvPath,
        toBusRidesCsv(selection, matchedRides, customerAccountByRideDocumentId),
        'utf8',
      ),
    ]);

    console.log(`Customer records resolved: ${matchingCustomers.length}`);
    console.log(`Bus Ride records found: ${matchedRides.length}`);
    console.log(`JSON output: ${jsonPath}`);
    console.log(`CSV output: ${csvPath}`);
  } catch (error) {
    await mkdir(outputDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(outputDirectory, 'bus-ride-fetch-error.png'),
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
  await page.goto(`${baseUrl}${BUS_RIDE_PATH}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const usernameInput = page.locator('input[name="username"]');
  const busRideSearch = page.locator('#search-busRide');
  await Promise.race([
    usernameInput.waitFor({ state: 'visible', timeout: 60_000 }),
    busRideSearch.waitFor({ state: 'visible', timeout: 60_000 }),
  ]);
  if (await busRideSearch.isVisible()) return reloadAndCapture(page);

  await usernameInput.fill(username);
  await page.locator('input[name="password"]').fill(password);
  let busRideResponse: Response | undefined;
  const captureResponse = (response: Response): void => {
    if (isRecordsResponse(response, '/object/busRide/getRecords')) {
      busRideResponse = response;
    }
  };
  page.on('response', captureResponse);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }),
    page.getByRole('button', { name: 'SIGN IN', exact: true }).click(),
  ]);
  console.log('Conx sign-in completed.');
  await page.waitForTimeout(10_000);

  if (!busRideResponse) {
    const responsePromise = page.waitForResponse(
      (response) => isRecordsResponse(response, '/object/busRide/getRecords'),
      { timeout: 60_000 },
    );
    await page.goto(`${baseUrl}${BUS_RIDE_PATH}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    busRideResponse = await responsePromise;
  }
  await busRideSearch.waitFor({ state: 'visible', timeout: 60_000 });
  page.off('response', captureResponse);
  if (!busRideResponse) throw new Error('Conx did not return the Bus Ride response');
  assertBrowserResponse(busRideResponse, 'initial Bus Ride request');
  return busRideResponse;
}

async function reloadAndCapture(page: Page): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) => isRecordsResponse(response, '/object/busRide/getRecords'),
    { timeout: 60_000 },
  );
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  const response = await responsePromise;
  assertBrowserResponse(response, 'initial Bus Ride request');
  return response;
}

async function fetchCustomers(
  page: Page,
  apiBaseUrl: string,
  headers: Record<string, string>,
  query: string,
): Promise<ConxCustomer[]> {
  const filtersResponse = await page.request.get(
    `${apiBaseUrl}/filter/customers/listView`,
    { headers, timeout: 60_000 },
  );
  assertApiResponse(filtersResponse, 'customer list-view filters');
  const body = (await filtersResponse.json()) as {
    result?: Array<{ docId?: string; id?: string; isMaster?: boolean }>;
  };
  const filters = body.result ?? [];
  const masterFilter = filters.find((filter) => filter.isMaster) ?? filters[0];
  const filterId = masterFilter?.docId ?? masterFilter?.id;
  if (!filterId) throw new Error('Conx did not return a Customer filter ID');

  const customers: ConxCustomer[] = [];
  const seenDocumentIds = new Set<string>();
  for (let offset = 0; ; offset += API_PAGE_SIZE) {
    const response = await page.request.post(
      `${apiBaseUrl}/object/customers/getRecords`,
      {
        headers,
        data: {
          filterId,
          limit: API_PAGE_SIZE,
          offset,
          q: query,
          order: { id: 'lastModified', desc: true },
          where: '',
        },
        timeout: 60_000,
      },
    );
    assertApiResponse(response, 'customer search');
    const batch = (await response.json()) as ConxCustomer[];
    const newCustomers = batch.filter((customer) => {
      if (seenDocumentIds.has(customer._docId)) return false;
      seenDocumentIds.add(customer._docId);
      return true;
    });
    customers.push(...newCustomers);
    if (batch.length < API_PAGE_SIZE || newCustomers.length === 0) break;
  }
  return customers;
}

async function fetchAllBusRides(
  page: Page,
  initialResponse: Response,
  headers: Record<string, string>,
): Promise<BusRide[]> {
  const requestBody = initialResponse.request().postDataJSON() as Record<string, unknown>;
  const rides: BusRide[] = [];
  for (let offset = 0; ; offset += API_PAGE_SIZE) {
    const response = await page.request.post(initialResponse.url(), {
      headers,
      data: { ...requestBody, limit: API_PAGE_SIZE, offset, q: '' },
      timeout: 60_000,
    });
    assertApiResponse(response, 'Bus Ride request');
    const batch = (await response.json()) as BusRide[];
    rides.push(...batch);
    if (batch.length < API_PAGE_SIZE) break;
  }
  return rides;
}

function reference(value: unknown): ConxReference | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ConxReference)
    : undefined;
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
