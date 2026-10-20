# Conx DB Validation

โปรเจกต์เริ่มต้นสำหรับตรวจผลจาก Database เทียบกับข้อมูลบน Website Conx ทีละ Row ด้วย Playwright

## Flow

1. อ่านผลจากแหล่งข้อมูลและเลือกจำนวนตาม `ROW_LIMIT` (ค่าเริ่มต้น 20)
2. Login เข้า Conx
3. ค้นหาทีละรายการด้วย Email
4. เปรียบเทียบ `email`, `status` และ `fullName`
5. ถ้าไม่ตรงหรือไม่พบ จะเก็บ Screenshot และ `validation-failures.json`
6. ทำให้ Test ล้มเหลวเมื่อมีรายการ Failed อย่างน้อยหนึ่งรายการ

## เริ่มต้นใช้งาน

ต้องมี Node.js 20 ขึ้นไป จากนั้นรัน:

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

แก้ค่า URL และบัญชี Test ใน `.env` แล้วรัน:

```bash
npm test
```

เปิด Browser ให้เห็นระหว่างทดสอบ:

```bash
npm run test:headed
```

ดู HTML report หลังรัน:

```bash
npm run report
```

## จุดที่ต้องปรับให้ตรงกับระบบจริง

### 1. Locator ของ Website Conx

แก้ไฟล์ `src/pages/conx.page.ts` ตรง `TODO(CONX)` ได้แก่:

- ช่อง Username และ Password
- ปุ่ม Login
- ช่องค้นหา Email
- Row ผลลัพธ์
- Element ที่แสดง ID, Email, Status และ Full name

แนะนำให้ทีมเว็บเพิ่ม `data-testid` ให้ element สำคัญ เพื่อให้ Test ไม่พังเมื่อข้อความหรือ CSS เปลี่ยน

### 2. Query Database

ขณะนี้ `src/support/database.ts` อ่านจาก `data/records.example.json` เพื่อให้เริ่มทำ UI flow ได้ทันที

เมื่อทราบชนิด Database ให้:

1. ติดตั้ง DB client ที่ตรงกับระบบ เช่น `pg`, `mysql2` หรือ `mssql`
2. เพิ่ม connection และ query ใน `src/support/database.ts`
3. ตั้ง `DATA_SOURCE=database` ใน `.env`
4. ให้ query ระบุลำดับเสมอ เช่น `ORDER BY created_at DESC` ก่อนจำกัด 20 Rows เพื่อให้ผลแต่ละรอบแน่นอน

อย่าเก็บ password หรือ connection string จริงลง Git

### 3. ฟิลด์ที่ต้องเปรียบเทียบ

แก้ type ที่ `src/types/customer-record.ts` และเพิ่มกติกาเทียบที่ `src/support/compare-records.ts`

## ผลลัพธ์เมื่อ Failed

ไฟล์ผลลัพธ์อยู่ใน `test-results/artifacts/` และ HTML report อยู่ใน `playwright-report/` โดยรายการ Failed มีข้อมูลพร้อมใช้เป็นหลักฐานเปิด Bug:

- Record ID และ Email
- สาเหตุ `NOT_FOUND`, `FIELD_MISMATCH` หรือ `CHECK_ERROR`
- Expected/Actual ของแต่ละฟิลด์
- Screenshot
- Playwright trace/video เมื่อ Test ล้มเหลว

ขั้นถัดไปควรยืนยันความแม่นยำของรายงานก่อน แล้วจึงเชื่อม Bug Tracker API เพื่อป้องกันการเปิด Bug ซ้ำ

## ดึง Parking Transaction ตาม Email

Script `scripts/parking-transaction/get-parking-transactions.ts` จะทำงานดังนี้:

1. Login เข้า Conx ด้วยค่าจาก `.env`
2. อ่าน Email จาก `data/parking-transection-test-data.json` แล้วค้นหา Customer
3. เก็บ Customer document ID ทุกตัวที่มี Email ตรงกันแบบ exact match
4. ดึง Parking Transaction ทุกหน้าและเก็บเฉพาะรายการที่อ้างถึง Customer ID เหล่านั้น
5. บันทึกผลเป็น JSON และ CSV ในโฟลเดอร์ `output/`

CSV จะ flatten ข้อมูล relation และ timestamp ให้อ่านง่าย พร้อม UTF-8 BOM เพื่อรองรับภาษาไทยใน Microsoft Excel

รันแบบ headless:

```bash
npm run parking:fetch
```

รันพร้อมเปิด Browser:

```bash
npm run parking:fetch:headed
```

Credentials อยู่ใน `.env` ซึ่งถูก ignore จาก Git และไม่ควรถูก commit

ก่อนรัน ให้แก้ Email ที่ต้องการตรวจในไฟล์ `data/parking-transection-test-data.json`:

```json
{
  "email": "tharathep.noe+99@mtel.co.th"
}
```

Email สำหรับทดสอบไม่ต้องเก็บใน `.env`

## เปรียบเทียบ Website กับ Database

Script 2 จะรัน Script 1 เพื่อ refresh ข้อมูล Website จากนั้น query PostgreSQL ด้วย Email ใน `data/parking-transection-test-data.json` และเปรียบเทียบข้อมูลทีละ Parking Detail ID

ตั้งค่า `IAM_DATABASE_URL` ใน `.env` แล้วรัน:

```bash
npm run run-parking-transaction-comparison -- --email "tharathep.noe+99@mtel.co.th"
```

คำสั่งนี้ใช้ Email เดียวกันกับทั้ง Step 1 (ดึงข้อมูลจาก Website) และ Step 2 (Query Database และเปรียบเทียบ) หากไม่ระบุ `--email` ระบบจะอ่านค่าจาก `data/parking-transection-test-data.json` ตามเดิม

ผลลัพธ์จะอยู่ที่ `output/parking-comparison-report-<email>.csv` โดยมีสถานะ `FIELD_MISMATCH`, `MISSING_ON_WEBSITE`, `MISSING_IN_DATABASE` หรือ `PASSED`

หากมี Website JSON ล่าสุดอยู่แล้วและไม่ต้องการดึงเว็บใหม่ ให้รัน:

```bash
npm run parking:compare:report -- --email tharathep.noe+99@mtel.co.th
```

## เปรียบเทียบ Parking Receipt Item กับ Database

Scripts อยู่ใน `scripts/parking-reciept/` และใช้ Email เดียวกันสำหรับดึงข้อมูลจากหน้า Parking Receipt Item กับ Query Database

รันทั้งสอง Step พร้อมกัน:

```bash
npm run run-parking-receipt-item-comparison -- --email "napasamonmanow@gmail.com"
```

คำสั่งนี้จะ:

1. ดึง Parking Receipt Item จาก Conx โดยค้นหา Customer ด้วย Email ที่ระบุ
2. Query ตาราง `parking_details`, `receipts` และ `items` ด้วย Email เดียวกัน
3. เปรียบเทียบ `Parking Receipt Item Name`, `Parking Transaction`, `Customer`, `Description`, `Quantity` และ `Total Price`
4. สร้างรายงานที่ `output/parking-receipt-item-comparison-report-<email>.csv`

หากไม่ระบุ `--email` ระบบจะอ่านจาก `data/parking-reciept-test-data.json`

หากมี Website JSON ล่าสุดอยู่แล้วและต้องการสร้างรายงานใหม่โดยไม่ดึง Website:

```bash
npm run parking-receipt:compare:report -- --email "napasamonmanow@gmail.com"
```

## เปรียบเทียบ Bus Ride กับ Database

Scripts อยู่ใน `scripts/bus-ride/` และทำงานตามลำดับดังนี้:

1. ดึง Bus Ride จาก Conx โดยค้นหา Customer ด้วย Email
2. หา `account_id` จาก IAM Database ด้วย Email เดียวกัน
3. ใช้ `account_id` ดึง `passenger_boardings` จาก PocketBase ด้วย `find_passenger_boardings.py`
4. เปรียบเทียบข้อมูล Bus Ride โดย resolve `Boarding Location` เป็นชื่อ, บวกเวลา `Boarding Time` ฝั่ง Database 7 ชั่วโมงก่อนเทียบกับเวลา Bangkok, เทียบ `Created Date` เฉพาะ `YYYY-MM-DDTHH` และไม่เทียบ `Last Modified`/`Modified User`

รัน Flow ทั้งหมด:

```bash
npm run run-bus-ride-comparison -- --email "chutikarn.jon+5@mtel.co.th"
```

ระบุ `Bus shift` เป็นเงื่อนไขค้นหาเพิ่มเติมได้ทั้งโหมด Email และ Route Name:

```bash
npm run run-bus-ride-comparison -- --email "chutikarn.jon+5@mtel.co.th" --bus-shift "08:00 - 09:00"
```

ตัวอย่างค้นหาด้วย Route Name และ Bus shift:

```bash
npm run run-bus-ride-comparison -- --route-name "Mtel (Office) - Lunch Canteen" --bus-shift "08:00 - 09:00"
```

เมื่อระบุ `--bus-shift` ระบบจะใช้ค่านี้กรองข้อมูลทั้ง Website และ Database และเติม shift ต่อท้ายชื่อไฟล์ output เพื่อไม่ให้เขียนทับผลการค้นหาที่ไม่ได้ระบุ shift

หรือค้นหาและเปรียบเทียบทุก Bus Ride ด้วย Route Name โดยไม่ต้องระบุ Email:

```bash
npm run run-bus-ride-comparison -- --route-name "Mtel (Office) - Lunch Canteen"
```

โหมด Route Name จะดึงข้อมูลทั้ง Website และ PocketBase ของ Route ที่ระบุ แล้วจับคู่ทีละรายการด้วย `Event Id` รวมถึงตรวจ `Customer`/`user_id`, `Scan Status` และ `Scan Failure Reason` โดยตรง

รายงานจะอยู่ที่ `output/bus-ride-comparison-report-<email>.csv` โดยใช้สถานะ `FIELD_MISMATCH`, `MISSING_ON_WEBSITE`, `MISSING_IN_DATABASE` หรือ `PASSED` หาก Event Id เดียวกันมีหลาย field ที่ไม่ตรง ระบบจะรวม field ด้วย ` | ` และระบุชื่อทั้งหมดในคอลัมน์ `Different Fields` ส่วน Website Value จะแสดงในบรรทัดถัดลงมาใต้ Database Value เพื่อให้ตรวจด้วย Manual ได้ง่าย

รันเฉพาะการหา `account_id` จาก IAM Database และดึง `passenger_boardings` จาก PocketBase:

```bash
npm run bus-ride:database -- --email "chutikarn.jon+5@mtel.co.th"
```

ผลลัพธ์จะอยู่ที่ `output/bus-rides-database-chutikarn.jon_5_mtel.co.th.json`

Environment ทั้งหมดอยู่ใน root `.env`:

- Conx: `CONX_BASE_URL`, `CONX_USERNAME`, `CONX_PASSWORD`
- IAM database: `AM_DATABASE_URL`
- Bus Ride/PocketBase: `PB_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`, `PB_INSECURE_TLS`

หากไม่กำหนด `AM_DATABASE_URL` ระบบจะนำ connection จาก `IAM_DATABASE_URL` มาใช้กับ database `ob_iam_uat` เพื่อรองรับ config เดิม

หากมี Website JSON และ Database JSON ล่าสุดอยู่แล้ว สามารถสร้าง report ใหม่โดยไม่ดึงข้อมูลซ้ำ:

```bash
npm run bus-ride:compare:report -- --email "chutikarn.jon+5@mtel.co.th"
```
