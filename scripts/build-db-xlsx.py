import csv
import os
import sqlite3
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = "kaggle"
DB = os.path.join(ROOT, "db", "adsense_approval.sqlite")
XLSX = os.path.join(ROOT, "adsense_approval.xlsx")

TABLES = [
    ("cases", "data/cases.csv", {"stale": int, "reachable": int, "score": float, "confidence": float,
                                 "words": int, "content_pages": int, "adsense_code": int,
                                 "can_monetize": int, "label_conflict": int, "included_in_calibration": int}),
    ("posts", "data/posts.csv", {"created_utc": int, "site_count": int}),
    ("tranco_sites", "data/tranco_sites.csv", {"score": float, "confidence": float, "words": int,
                                               "content_pages": int, "can_monetize": int}),
    ("forum_cases", "data/forum_cases.csv", {"score": float, "stale": int, "reachable": int,
                                             "words": int, "adsense_code": int}),
    ("calibration_bands", "data/calibration_bands.csv", {"min": float, "max": float, "positives": int,
                                                         "negatives": int, "lr": float, "lr_low": float,
                                                         "lr_high": float, "prior": float, "posterior": float}),
    ("calibration_meta", "data/calibration_meta.csv", {}),
]

os.makedirs(os.path.join(ROOT, "db"), exist_ok=True)
if os.path.exists(DB):
    os.remove(DB)

conn = sqlite3.connect(DB)
with open(os.path.join(ROOT, "schema.sql"), encoding="utf-8") as f:
    conn.executescript(f.read())

for table, rel, numeric in TABLES:
    path = os.path.join(ROOT, rel)
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        placeholders = ",".join("?" for _ in cols)
        sql = f'INSERT INTO {table} ({",".join(cols)}) VALUES ({placeholders})'
        rows = []
        for r in reader:
            vals = []
            for c in cols:
                v = r[c]
                if v == "":
                    vals.append(None)
                elif c in numeric:
                    vals.append(numeric[c](v))
                else:
                    vals.append(v)
            rows.append(vals)
        conn.executemany(sql, rows)
        conn.commit()
        print(f"{table}: {len(rows)} filas")

check = conn.execute("PRAGMA integrity_check").fetchone()[0]
print("integrity_check:", check)
for table, _, _ in TABLES:
    n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"sqlite {table}: {n}")
conn.close()

wb = Workbook()
wb.remove(wb.active)
header_fill = PatternFill("solid", fgColor="172554")
header_font = Font(color="FFFFFF", bold=True)
for table, rel, _ in TABLES:
    ws = wb.create_sheet(table)
    path = os.path.join(ROOT, rel)
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            ws.append(row)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center")
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for idx, col in enumerate(ws.columns, start=1):
        max_len = max((len(str(c.value)) for c in list(col)[:120] if c.value is not None), default=10)
        ws.column_dimensions[get_column_letter(idx)].width = min(max(10, max_len + 2), 48)
    if table in ("cases", "posts"):
        for cell in ws["V" if table == "cases" else "D"]:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
wb.save(XLSX)
print("xlsx:", XLSX, "sheets:", wb.sheetnames)
