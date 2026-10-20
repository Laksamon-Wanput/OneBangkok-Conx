#!/usr/bin/env python3
"""Find PocketBase passenger boarding records by IAM account_id."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, NoReturn


FIELD_NAMES = [
    "Boarding Location",
    "Boarding Time",
    "Bus Reference",
    "Bus shift",
    "Created User",
    "Created Date",
    "Customer",
    "Event Id",
    "Last Modified",
    "Modified User",
    "Route Name",
    "Scan Failure Reason",
    "Scan Status",
    "Tenant name",
]


def fail(message: str, exit_code: int = 1) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(exit_code)


def log(message: str) -> None:
    """Print progress without corrupting JSON or CSV written to stdout."""
    print(f"[CONX] {message}", file=sys.stderr, flush=True)


def load_dotenv(path: Path) -> dict[str, str]:
    """Load KEY=VALUE pairs without requiring python-dotenv."""
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            fail(f"รูปแบบ .env ไม่ถูกต้องที่บรรทัด {line_number}", 2)
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def env_value(dotenv: dict[str, str], key: str, default: str = "") -> str:
    return os.getenv(key) or dotenv.get(key) or default


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def nested(record: dict[str, Any], *keys: str) -> Any:
    current: Any = record
    for key in keys:
        if not isinstance(current, dict):
            return ""
        current = current.get(key, "")
    return current if current is not None else ""


def pocketbase_api_url(pb_url: str, endpoint: str) -> str:
    """Build a PocketBase API URL from its mounted application base URL."""
    return f"{pb_url.rstrip('/')}/api/{endpoint.lstrip('/')}"


class PocketBaseClient:
    def __init__(self, base_url: str, insecure_tls: bool = False, timeout: int = 30):
        self.base_url = base_url
        self.timeout = timeout
        self.token = ""
        self.auth_email = ""
        if insecure_tls:
            self.ssl_context = ssl._create_unverified_context()
        else:
            self.ssl_context = ssl.create_default_context()

    def request(
        self,
        method: str,
        endpoint: str,
        *,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = pocketbase_api_url(self.base_url, endpoint)
        if query:
            url += "?" + urllib.parse.urlencode(query)

        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = self.token
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(
                request, timeout=self.timeout, context=self.ssl_context
            ) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read().decode("utf-8")).get("message", "")
            except (UnicodeDecodeError, json.JSONDecodeError):
                detail = ""
            suffix = f": {detail}" if detail else ""
            fail(f"PocketBase ตอบ HTTP {error.code}{suffix}")
        except urllib.error.URLError as error:
            if isinstance(error.reason, ssl.SSLCertVerificationError):
                fail(
                    "ตรวจสอบ TLS certificate ไม่ผ่าน; สำหรับ UAT ให้กำหนด "
                    "PB_INSECURE_TLS=true หรือใช้ --insecure"
                )
            fail(f"เชื่อมต่อ PocketBase ไม่สำเร็จ: {error.reason}")
        except TimeoutError:
            fail("PocketBase ใช้เวลาตอบกลับนานเกินกำหนด")

        if not isinstance(result, dict):
            fail("PocketBase ส่ง response ที่ไม่ใช่ JSON object")
        return result

    def authenticate(self, email: str, password: str) -> None:
        log(f"กำลัง login PocketBase ด้วย {email}...")
        result = self.request(
            "POST",
            "collections/_superusers/auth-with-password",
            payload={"identity": email, "password": password},
        )
        token = result.get("token")
        if not isinstance(token, str) or not token:
            fail("login สำเร็จแต่ response ไม่มี auth token")
        self.token = token
        record = result.get("record", {})
        self.auth_email = str(record.get("email") or email)
        log("login PocketBase สำเร็จ")

    def find_boardings(
        self,
        account_id: str | None = None,
        bus_shift: str | None = None,
        per_page: int = 200,
    ) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        page = 1
        # json.dumps produces the quoted and escaped string PocketBase filters expect.
        filters = []
        if account_id:
            filters.append(f"user_id = {json.dumps(account_id, ensure_ascii=False)}")
        if bus_shift:
            filters.append(f"bus_shift = {json.dumps(bus_shift, ensure_ascii=False)}")
        record_filter = " && ".join(filters)
        while True:
            search_parts = []
            if account_id:
                search_parts.append(f"account_id={account_id}")
            if bus_shift:
                search_parts.append(f"bus_shift={bus_shift}")
            search_label = ", ".join(search_parts) or "ทุก account"
            log(f"กำลังค้นหา {search_label} (หน้า {page})...")
            query: dict[str, Any] = {
                "page": page,
                "perPage": per_page,
                "sort": "-created",
                "expand": "boarding_location_id,device_id.bus_id,trip_id.route_id",
            }
            if record_filter:
                query["filter"] = record_filter
            result = self.request(
                "GET",
                "collections/passenger_boardings/records",
                query=query,
            )
            items = result.get("items", [])
            if not isinstance(items, list):
                fail("PocketBase response ไม่มี items array")
            records.extend(item for item in items if isinstance(item, dict))
            total_pages = int(result.get("totalPages") or 0)
            total_items = int(result.get("totalItems") or len(records))
            log(
                f"หน้า {page}/{max(total_pages, 1)}: ได้ {len(items)} record(s) "
                f"จากทั้งหมด {total_items}"
            )
            if page >= total_pages:
                break
            page += 1
        log(f"ค้นหาเสร็จแล้ว พบทั้งหมด {len(records)} record(s)")
        return records


def map_record(record: dict[str, Any], modified_user: str) -> dict[str, Any]:
    return {
        "Boarding Location": (
            nested(record, "expand", "boarding_location_id", "name")
            or record.get("boarding_location_id", "")
        ),
        "Boarding Time": record.get("boarding_time", ""),
        "Bus Reference": nested(
            record, "expand", "device_id", "expand", "bus_id", "name"
        ),
        "Bus shift": record.get("bus_shift", ""),
        "Created User": record.get("user_id", ""),
        "Created Date": record.get("created", ""),
        "Customer": record.get("user_id", ""),
        "Event Id": record.get("id", ""),
        "Last Modified": "",
        "Modified User": modified_user,
        "Route Name": nested(
            record, "expand", "trip_id", "expand", "route_id", "name"
        ),
        "Scan Failure Reason": record.get("scan_failure_reason", ""),
        "Scan Status": record.get("scan_status", ""),
        "Tenant name": record.get("tenant_name", ""),
    }


def csv_text(rows: list[dict[str, Any]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=FIELD_NAMES)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def table_cell(value: Any, max_width: int = 36) -> str:
    if isinstance(value, (dict, list)):
        rendered = json.dumps(value, ensure_ascii=False)
    else:
        rendered = str(value if value is not None else "")
    rendered = rendered.replace("\r", " ").replace("\n", " ")
    if len(rendered) > max_width:
        return rendered[: max_width - 1] + "…"
    return rendered


def print_table(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return

    rendered_rows = [
        [table_cell(row.get(field, "")) for field in FIELD_NAMES] for row in rows
    ]
    widths = [
        max(len(field), *(len(row[index]) for row in rendered_rows))
        for index, field in enumerate(FIELD_NAMES)
    ]

    separator = "+-" + "-+-".join("-" * width for width in widths) + "-+"
    header = "| " + " | ".join(
        field.ljust(widths[index]) for index, field in enumerate(FIELD_NAMES)
    ) + " |"
    print(separator)
    print(header)
    print(separator)
    for row in rendered_rows:
        print(
            "| "
            + " | ".join(value.ljust(widths[index]) for index, value in enumerate(row))
            + " |"
        )
    print(separator)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="ค้นหา passenger boarding records ด้วย IAM account_id"
    )
    search = parser.add_mutually_exclusive_group(required=True)
    search.add_argument("--account-id", help="IAM account_id ที่ต้องการค้นหา")
    search.add_argument("--route-name", help="Route Name ที่ต้องการค้นหาทุก account")
    parser.add_argument("--bus-shift", help="กรอง Bus shift เพิ่มเติม")
    parser.add_argument(
        "--modified-user",
        help=(
            "CONX user ที่ login อยู่; ถ้าไม่ระบุจะใช้ CONX_MODIFIED_USER "
            "หรือ PB admin email"
        ),
    )
    parser.add_argument(
        "--format", choices=("table", "json", "csv"), default="table"
    )
    parser.add_argument("--output", type=Path, help="บันทึกผลลัพธ์ลงไฟล์")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="ข้ามการตรวจ TLS certificate (ใช้กับ UAT เท่านั้น)",
    )
    parser.add_argument("--timeout", type=int, default=30)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    account_id = args.account_id.strip() if args.account_id else None
    route_name = args.route_name.strip() if args.route_name else None
    bus_shift = args.bus_shift.strip() if args.bus_shift else None
    if args.account_id is not None and not account_id:
        fail("--account-id ห้ามเป็นค่าว่าง", 2)
    if args.route_name is not None and not route_name:
        fail("--route-name ห้ามเป็นค่าว่าง", 2)
    if args.bus_shift is not None and not bus_shift:
        fail("--bus-shift ห้ามเป็นค่าว่าง", 2)
    if args.timeout <= 0:
        fail("--timeout ต้องมากกว่า 0", 2)

    dotenv_path = Path(__file__).resolve().parents[2] / ".env"
    dotenv = load_dotenv(dotenv_path)
    pb_url = env_value(dotenv, "PB_URL")
    email = env_value(dotenv, "PB_ADMIN_EMAIL")
    password = env_value(dotenv, "PB_ADMIN_PASSWORD")
    if not pb_url or not email or not password:
        fail(
            "กรุณากำหนด PB_URL, PB_ADMIN_EMAIL และ PB_ADMIN_PASSWORD "
            f"ใน {dotenv_path} หรือ environment variables",
            2,
        )

    insecure_tls = args.insecure or parse_bool(
        env_value(dotenv, "PB_INSECURE_TLS", "false")
    )
    log(f"กำลังเชื่อมต่อ PocketBase: {pb_url}")
    if insecure_tls:
        log("ใช้โหมดข้ามการตรวจ TLS certificate (UAT)")
    client = PocketBaseClient(pb_url, insecure_tls=insecure_tls, timeout=args.timeout)
    client.authenticate(email, password)
    source_records = client.find_boardings(account_id, bus_shift)
    modified_user = (
        args.modified_user
        or env_value(dotenv, "CONX_MODIFIED_USER")
        or client.auth_email
    )
    rows = [map_record(record, modified_user) for record in source_records]
    if route_name:
        normalized_route = route_name.casefold()
        rows = [
            row
            for row in rows
            if str(row.get("Route Name", "")).strip().casefold() == normalized_route
        ]
        log(f"กรอง Route Name={route_name} แล้วเหลือ {len(rows)} record(s)")

    if args.format == "json":
        rendered = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    elif args.format == "csv":
        rendered = csv_text(rows)
    else:
        rendered = ""

    if args.output:
        if args.format == "table":
            fail("--output รองรับเมื่อใช้ --format json หรือ --format csv เท่านั้น", 2)
        args.output.write_text(rendered, encoding="utf-8", newline="")
        print(f"พบ {len(rows)} record(s); บันทึกแล้วที่ {args.output}")
    elif args.format == "table":
        if rows:
            print_table(rows)
        print(f"\nพบทั้งหมด {len(rows)} record(s)")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
