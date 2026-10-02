import { Pool } from 'pg';

export type DatabaseParkingRow = {
  'Parking Detail ID': unknown;
  'Check Handwriting 2': unknown;
  Address: unknown;
  Counter: unknown;
  Customer: unknown;
  'Image Url': unknown;
  'Mall Name': unknown;
  'Merchant Name': unknown;
  Message: unknown;
  'Receipt No': unknown;
  Status: unknown;
  Total: unknown;
  'Transaction Date': unknown;
  'Transaction Time': unknown;
  UID: unknown;
  'Unit No': unknown;
  'Created User': unknown;
};

const PARKING_QUERY = `
SELECT
    pd.id                    AS "Parking Detail ID",
    r.check_handwriting      AS "Check Handwriting 2",
    r.address                AS "Address",
    r.counter                AS "Counter",
    pd.account_id            AS "Customer",
    r.image_url              AS "Image Url",
    r.mall_name              AS "Mall Name",
    r.merchant_name          AS "Merchant Name",
    r.message                AS "Message",
    r.receipt_no             AS "Receipt No",
    r.status                 AS "Status",
    r.total                  AS "Total",
    r.transaction_date       AS "Transaction Date",
    r.transaction_time       AS "Transaction Time",
    r.uid                    AS "UID",
    r.unit_no                AS "Unit No",
    r.created_by             AS "Created User"
FROM parking_details pd
INNER JOIN receipts r
    ON r.parking_detail_id = pd.id
WHERE LOWER(pd.email) = LOWER($1)
ORDER BY r.created_at DESC;
`;

export async function queryParkingTransactions(
  connectionString: string,
  email: string,
): Promise<DatabaseParkingRow[]> {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 15_000,
    query_timeout: 30_000,
  });

  try {
    const result = await pool.query<DatabaseParkingRow>(PARKING_QUERY, [email]);
    return result.rows;
  } finally {
    await pool.end();
  }
}
