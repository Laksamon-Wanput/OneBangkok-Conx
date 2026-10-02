export type CustomerRecord = {
  id: string;
  email: string;
  status: string;
  fullName?: string;
};

export type ValidationFailure = {
  id: string;
  email: string;
  reason: 'NOT_FOUND' | 'FIELD_MISMATCH' | 'CHECK_ERROR';
  differences?: Record<string, { expected: unknown; actual: unknown }>;
  error?: string;
};
