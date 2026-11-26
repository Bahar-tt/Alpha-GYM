"""Read-only reconciliation of H:\\ثبت نام جدید.xls against the live DB.

No writes: only parses the spreadsheet and runs read-only SELECT queries via
scripts/db_query.py. Output goes to local/ (gitignored), never to Git.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import jdatetime
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
LOCAL = ROOT / "local"
EXCEL_NAME = "\u062b\u0628\u062a \u0646\u0627\u0645 \u062c\u062f\u06cc\u062f.xls"
EXCEL = Path("H:/") / EXCEL_NAME
TMP_XLSX = LOCAL / "_thbat_nam_jadid.xlsx"
REPORT = LOCAL / "regs_reconcile_20261126.md"
DB_QUERY = SCRIPTS / "db_query.py"

DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def norm_digits(value) -> str:
    return str(value or "").translate(DIGITS).strip()


def norm_name(value) -> str:
    text = str(value or "").replace("ي", "ی").replace("ك", "ک").replace("ة", "ه")
    return re.sub(r"\s+", "", text).strip()


def parse_jalali(value) -> str:
    raw = norm_digits(value)
    match = re.fullmatch(r"(\d{4})/(\d{1,2})/(\d{1,2})", raw)
    if not match:
        return ""
    jy, jm, jd = (int(x) for x in match.groups())
    try:
        return jdatetime.date(jy, jm, jd).togregorian().isoformat()
    except ValueError:
        return ""


def read_excel() -> list[dict]:
    if not EXCEL.exists():
        raise SystemExit(f"Excel file not found: {EXCEL}")
    LOCAL.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(EXCEL, TMP_XLSX)
    wb = load_workbook(TMP_XLSX, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise SystemExit("Excel sheet is empty")
    header = [str(x or "").strip() for x in rows[0]]
    wanted = {
        "name": "نام و نام خانوادگی",
        "sport": "رشته ورزشی",
        "status": "وضعیت ثبت نام",
        "start": "تاریخ شروع",
        "expiry": "تاریخ اعتبار",
        "code": "کدعضویت",
        "debt": "مانده بدهی",
    }
    idx = {key: header.index(label) for key, label in wanted.items() if label in header}
    missing = [label for label in wanted.values() if label not in header]
    if missing:
        raise SystemExit(f"Missing Excel columns: {missing}")

    out = []
    for excel_row, values in enumerate(rows[1:], start=2):
        code = norm_digits(values[idx["code"]])
        if not re.fullmatch(r"\d+", code):
            continue  # total row / blank row
        out.append({
            "excel_row": excel_row,
            "code": code,
            "name": str(values[idx["name"]] or "").strip(),
            "sport": str(values[idx["sport"]] or "").strip(),
            "status": str(values[idx["status"]] or "").strip(),
            "start_raw": str(values[idx["start"]] or "").strip(),
            "expiry_raw": str(values[idx["expiry"]] or "").strip(),
            "start": parse_jalali(values[idx["start"]]),
            "expiry": parse_jalali(values[idx["expiry"]]),
            "debt": norm_digits(values[idx["debt"]]),
        })
    wb.close()
    return out


def query_members(codes: list[str]) -> dict[str, dict]:
    unique = sorted(set(codes))
    quoted = ",".join("'" + c.replace("'", "") + "'" for c in unique)
    sql = (
        "SELECT id,name,member_code,start_date,expiry_date,sport "
        f"FROM members WHERE member_code IN ({quoted})"
    )
    proc = subprocess.run(
        [sys.executable, str(DB_QUERY), "--sql", sql, "--limit", "1000"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if proc.returncode != 0:
        raise SystemExit(f"db_query failed: {proc.stdout[-2000:]}\n{proc.stderr[-2000:]}")
    raw = proc.stdout or ""
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        raise SystemExit(f"db_query returned no JSON: {raw[-2000:]}\n{proc.stderr[-2000:]}")
    data = json.loads(raw[start:end + 1])
    return {str(row["member_code"]): row for row in data["rows"]}


def md_cell(value) -> str:
    return str(value or "—").replace("|", "\\|")


def main() -> int:
    rows = read_excel()
    codes = [r["code"] for r in rows]
    dupes = {code: n for code, n in Counter(codes).items() if n > 1}
    bad_dates = [r for r in rows if not r["start"] or not r["expiry"]]
    db = query_members(codes)

    new_rows, date_updates, name_conflicts, unchanged = [], [], [], []
    for row in rows:
        found = db.get(row["code"])
        if not found:
            new_rows.append(row)
            continue
        if norm_name(found.get("name")) != norm_name(row["name"]):
            name_conflicts.append((row, found))
            continue
        old_start = str(found.get("start_date") or "")[:10]
        old_expiry = str(found.get("expiry_date") or "")[:10]
        if old_start == row["start"] and old_expiry == row["expiry"]:
            unchanged.append(row)
        else:
            date_updates.append((row, found))

    lines = [
        "# تطبیق «ثبت نام جدید» با DB زنده — فقطخواندنی",
        "",
        f"تولید: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "هیچ تغییری در DB، اثر انگشت، بکاند یا فرانت انجام نشده است.",
        "",
        "## خلاصه",
        "",
        f"- ردیفهای معتبر اکسل: {len(rows)}",
        f"- کدهای تکراری در اکسل: {len(dupes)}",
        f"- تاریخهای ناقص/غیرقابل تبدیل: {len(bad_dates)}",
        f"- عضو جدید (کد در DB نیست): {len(new_rows)}",
        f"- فقط نیاز به بهروزرسانی تاریخ: {len(date_updates)}",
        f"- تضاد نام (نیاز به تصمیم شما): {len(name_conflicts)}",
        f"- تاریخها یکسان است: {len(unchanged)}",
        "",
    ]

    def table(title, items, renderer):
        lines.extend([f"## {title}", "", "| ردیف اکسل | کدعضویت | جزئیات |", "|---:|---|---|"])
        for item in items:
            lines.append("| " + renderer(item) + " |")
        lines.append("")

    table(
        "جدید (اضافه خواهند شد)", new_rows,
        lambda r: f"{r['excel_row']} | {md_cell(r['code'])} | {md_cell(r['name'])} · {md_cell(r['sport'])} · {r['start']} → {r['expiry']}",
    )
    table(
        "بهروزرسانی تاریخ (پیشنهادی)", date_updates,
        lambda p: (
            f"{p[0]['excel_row']} | {md_cell(p[0]['code'])} | {md_cell(p[0]['name'])} · "
            f"DB: {str(p[1].get('start_date') or '—')[:10]} → {str(p[1].get('expiry_date') or '—')[:10]} · "
            f"Excel: {p[0]['start']} → {p[0]['expiry']}"
        ),
    )
    table(
        "تضاد نام (قبل از هر تغییر بپرس)", name_conflicts,
        lambda p: (
            f"{p[0]['excel_row']} | {md_cell(p[0]['code'])} | Excel: {md_cell(p[0]['name'])} · "
            f"DB: {md_cell(p[1].get('name'))} (id={p[1].get('id')})"
        ),
    )
    if dupes:
        table("کدهای تکراری", list(dupes.items()), lambda x: f"— | {md_cell(x[0])} | {x[1]} بار")
    if bad_dates:
        table("تاریخ ناقص", bad_dates, lambda r: f"{r['excel_row']} | {md_cell(r['code'])} | شروع={md_cell(r['start_raw'])} اعتبار={md_cell(r['expiry_raw'])}")

    REPORT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print("REPORT_OK", REPORT)
    print(json.dumps({
        "excel_rows": len(rows),
        "new": len(new_rows),
        "date_updates": len(date_updates),
        "name_conflicts": len(name_conflicts),
        "unchanged": len(unchanged),
        "duplicate_codes": len(dupes),
        "bad_dates": len(bad_dates),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
