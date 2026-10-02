import { Pool } from 'pg';

export type DatabaseParkingReceiptItemRow = {
  'Parking Receipt Item Name': unknown;
  'Parking Transaction': unknown;
  Customer: unknown;
  Description: unknown;
  Quantity: unknown;
  'Total Price': unknown;
};

const PARKING_RECEIPT_ITEM_QUERY = `
SELECT
    i.id                AS "Parking Receipt Item Name",
    i.receipt_id        AS "Parking Transaction",
    pd.account_id       AS "Customer",
    i.description       AS "Description",
    i.quantity          AS "Quantity",
    i.total_price       AS "Total Price"
FROM parking_details pd
INNER JOIN receipts r
    ON r.parking_detail_id = pd.id
INNER JOIN items i
    ON i.receipt_id = r.id
WHERE LOWER(pd.email) = LOWER($1)
ORDER BY
    r.created_at DESC,
    i.id ASC;
`;

export async function queryParkingReceiptItems(
  connectionString: string,
  email: string,
): Promise<DatabaseParkingReceiptItemRow[]> {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 15_000,
    query_timeout: 30_000,
  });

  try {
    const result = await pool.query<DatabaseParkingReceiptItemRow>(
      PARKING_RECEIPT_ITEM_QUERY,
      [email],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}
