import { Pool } from 'pg';

const ACCOUNT_QUERY = `
SELECT DISTINCT
    identity_row.account_id::text AS account_id
FROM public.identity AS identity_row
WHERE EXISTS (
    SELECT 1
    FROM jsonb_each_text(to_jsonb(identity_row)) AS field(key, value)
    WHERE LOWER(field.value) = LOWER($1)
)
ORDER BY account_id;
`;

export async function queryAccountIdsByEmail(
  connectionString: string,
  email: string,
): Promise<string[]> {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 20_000,
    query_timeout: 30_000,
  });

  try {
    const result = await pool.query<{ account_id: string }>(ACCOUNT_QUERY, [email]);
    return result.rows.map((row) => row.account_id).filter(Boolean);
  } finally {
    await pool.end();
  }
}

export function iamConnectionStringFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment.AM_DATABASE_URL;
  if (configured) return configured;

  const fallback = environment.IAM_DATABASE_URL;
  if (!fallback) {
    throw new Error('Missing required environment variable: AM_DATABASE_URL');
  }

  const url = new URL(fallback);
  url.pathname = '/ob_iam_uat';
  return url.toString();
}
