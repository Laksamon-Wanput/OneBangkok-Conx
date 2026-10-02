import { expect, type Page } from '@playwright/test';
import type { CustomerRecord } from '../types/customer-record';

export class ConxPage {
  constructor(private readonly page: Page) {}

  async login(): Promise<void> {
    const username = process.env.CONX_USERNAME;
    const password = process.env.CONX_PASSWORD;

    if (!username || !password) {
      throw new Error('Set CONX_USERNAME and CONX_PASSWORD in .env');
    }

    await this.page.goto('/');

    // TODO(CONX): ปรับ locator ให้ตรงกับหน้า Login จริง
    await this.page.getByLabel(/email|username/i).fill(username);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /sign in|log in|login/i }).click();

    // TODO(CONX): เปลี่ยนเป็น element ที่ยืนยันว่า Login สำเร็จ
    await expect(this.page).not.toHaveURL(/login/i);
  }

  async findByEmail(email: string): Promise<CustomerRecord | null> {
    // TODO(CONX): หากหน้าค้นหาอยู่ path อื่น ให้ navigate ไป path นั้นก่อน
    const searchInput = this.page.getByRole('textbox', { name: /search|email/i });
    await searchInput.fill(email);
    await searchInput.press('Enter');

    // TODO(CONX): ปรับ row locator และ data-testid ให้ตรงกับ DOM จริง
    const resultRow = this.page.getByRole('row').filter({ hasText: email }).first();
    const found = await resultRow.isVisible().catch(() => false);

    if (!found) {
      return null;
    }

    return {
      id: (await resultRow.getByTestId('customer-id').textContent())?.trim() ?? '',
      email: (await resultRow.getByTestId('customer-email').textContent())?.trim() ?? '',
      status: (await resultRow.getByTestId('customer-status').textContent())?.trim() ?? '',
      fullName: (await resultRow.getByTestId('customer-name').textContent())?.trim(),
    };
  }
}
