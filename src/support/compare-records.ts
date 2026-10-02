import type { CustomerRecord } from '../types/customer-record';

export type RecordDifferences = Record<
  string,
  { expected: unknown; actual: unknown }
>;

export function compareRecords(
  expected: CustomerRecord,
  actual: CustomerRecord,
): RecordDifferences {
  const differences: RecordDifferences = {};

  compareField(differences, 'email', expected.email, actual.email);
  compareField(differences, 'status', expected.status, actual.status);
  compareField(differences, 'fullName', expected.fullName, actual.fullName);

  return differences;
}

function compareField(
  differences: RecordDifferences,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  if (normalize(expected) !== normalize(actual)) {
    differences[field] = { expected, actual };
  }
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}
