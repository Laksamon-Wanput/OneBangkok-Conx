import { expect, test } from '@playwright/test';
import {
  busRideSelectionArgs,
  busRideSelectionOutputKey,
  loadBusRideSelection,
} from '../src/support/bus-ride-test-data';

test('loads Route Name as a Bus Ride selection', async () => {
  const selection = await loadBusRideSelection([
    '--route-name',
    'Mtel (Office) - Lunch Canteen',
  ]);

  expect(selection).toEqual({
    mode: 'route',
    value: 'Mtel (Office) - Lunch Canteen',
  });
  expect(busRideSelectionArgs(selection)).toEqual([
    '--route-name',
    'Mtel (Office) - Lunch Canteen',
  ]);
  expect(busRideSelectionOutputKey(selection)).toBe(
    'route-Mtel__Office__-_Lunch_Canteen',
  );
});

test('rejects using Email and Route Name together', async () => {
  await expect(loadBusRideSelection([
    '--email',
    'customer@example.com',
    '--route-name',
    'Route A',
  ])).rejects.toThrow('Use either --email or --route-name, not both');
});
