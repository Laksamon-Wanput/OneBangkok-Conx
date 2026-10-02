import { expect, test } from '@playwright/test';
import { compareRecords } from '../src/support/compare-records';

test('returns no differences when DB and Conx values match', () => {
  const expected = {
    id: '1001',
    email: 'customer@example.com',
    status: 'ACTIVE',
    fullName: 'Example Customer',
  };

  const actual = {
    ...expected,
    email: ' CUSTOMER@EXAMPLE.COM ',
    status: 'active',
  };

  expect(compareRecords(expected, actual)).toEqual({});
});

test('lists every field that does not match', () => {
  const expected = {
    id: '1001',
    email: 'customer@example.com',
    status: 'ACTIVE',
    fullName: 'Example Customer',
  };

  const actual = {
    ...expected,
    status: 'INACTIVE',
    fullName: 'Another Customer',
  };

  expect(compareRecords(expected, actual)).toEqual({
    status: { expected: 'ACTIVE', actual: 'INACTIVE' },
    fullName: { expected: 'Example Customer', actual: 'Another Customer' },
  });
});
