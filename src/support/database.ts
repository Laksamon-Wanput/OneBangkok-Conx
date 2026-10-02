import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CustomerRecord } from '../types/customer-record';

/**
 * จุดเชื่อมข้อมูลต้นทางของ Test
 *
 * ตอนเริ่มต้นจะอ่าน JSON เพื่อให้พัฒนา UI flow ได้ก่อน เมื่อทราบชนิด DB แล้ว
 * ให้เพิ่ม adapter ของ DB และแทนที่ส่วน DATA_SOURCE=database ด้วย query จริง
 * โดยต้องใช้ parameterized query หากมี input จากภายนอก
 */
export async function getRecords(limit: number): Promise<CustomerRecord[]> {
  const source = process.env.DATA_SOURCE ?? 'json';

  if (source === 'json') {
    const configuredPath = process.env.RECORDS_FILE ?? './data/records.example.json';
    const filePath = path.resolve(process.cwd(), configuredPath);
    const content = await readFile(filePath, 'utf8');
    const records = JSON.parse(content) as CustomerRecord[];

    return records.slice(0, limit);
  }

  if (source === 'database') {
    throw new Error(
      'Database adapter is not configured. Add the DB client and query in src/support/database.ts.',
    );
  }

  throw new Error(`Unsupported DATA_SOURCE: ${source}`);
}
