import { expect, test } from '@playwright/test';
import { iamConnectionStringFromEnvironment } from '../src/support/bus-ride-account-database';

test('uses AM_DATABASE_URL when configured', () => {
  expect(iamConnectionStringFromEnvironment({
    AM_DATABASE_URL: 'postgresql://user:password@db.example/ob_iam_uat',
  })).toBe('postgresql://user:password@db.example/ob_iam_uat');
});

test('derives the IAM database from the existing database connection as fallback', () => {
  expect(iamConnectionStringFromEnvironment({
    IAM_DATABASE_URL: 'postgresql://user:password@db.example/ob_parking_uat',
  })).toBe('postgresql://user:password@db.example/ob_iam_uat');
});
