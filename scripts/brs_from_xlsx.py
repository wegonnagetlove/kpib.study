#!/usr/bin/env python3
"""Итоги БРС из локального журнала группы (.xlsx) в data/brs_journal.json и data/brs.json.

Запуск: python3 scripts/brs_from_xlsx.py путь/к/журналу.xlsx
Нужен openpyxl. Листы ПВДИ, АПИП, ПРОИ, ФилПр: строка с «№» и ФИО, даты занятий в шапке,
столбец ИТОГО и перед ним ДОП. ИТОГО считается суммой занятий и ДОП (как формула =SUM в журнале).
brs_snapshot.py берёт из brs_journal.json те дисциплины, где журнал новее таблицы Google.
"""
import json, re, sys
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
MSK = timezone(timedelta(hours=3))
SHEETS = {"proi": ("ПРОИ", "Экзамен"), "pvdi": ("ПВДИ", "Экзамен"), "apip": ("АПИП", "Экзамен"), "filpr": ("ФилПр", "Зачёт")}
YEAR = 2026


def as_date(v):
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    m = re.fullmatch(r"\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*", str(v or ""))
    return f"{m[3] or YEAR}-{int(m[2]):02d}-{int(m[1]):02d}" if m else None


def parse(ws):
    rows = [[c.value for c in r] for r in ws.iter_rows()]
    hi = next(i for i, r in enumerate(rows) if r and str(r[0] or "").strip() == "№")
    head = [str(c or "").strip().lower() for c in rows[hi]]
    tot = next(j for j, c in enumerate(head) if c.startswith("итого"))
    dop = tot - 1  # ДОП стоит перед ИТОГО (в ПРОИ и ФилПр без подписи)
    # дата занятия: в строке шапки или в строках над ней
    def col_date(j):
        for r in rows[: hi + 1][::-1]:
            d = as_date(r[j]) if j < len(r) else None
            if d:
                return d
        return None
    body = [r for r in rows[hi + 1:] if isinstance(r[0], (int, float)) and r[1]]
    cols = list(range(2, dop))
    num = lambda v: v if isinstance(v, (int, float)) else None  # noqa: E731
    held = [j for j in cols if any(num(r[j]) is not None for r in body)]
    out = {}
    for r in body:
        vals = [num(r[j]) or 0 for j in cols]
        extra = num(r[dop]) or 0
        out[str(r[1]).strip()] = {
            "total": round(sum(vals) + extra, 2),
            "extra": round(extra, 2),
            "present": sum(1 for j in held if num(r[j]) is not None),
            "missed": sum(1 for j in held if num(r[j]) is None),
        }
    hd = sorted(d for d in (col_date(j) for j in held) if d)
    return {"held": hd, "asof": hd[-1] if hd else None, "students": out}


def main():
    wb = openpyxl.load_workbook(sys.argv[1], data_only=False)
    path = ROOT / "data" / "brs.json"
    brs = json.loads(path.read_text("utf-8"))
    journal = {}
    for key, (sheet, kind) in SHEETS.items():
        j = parse(wb[sheet])
        old = brs["subjects"].get(key, {})
        dates = sorted(set(old.get("dates", [])) | set(j["held"]))
        journal[key] = {"kind": kind, "held": j["held"], "asof": j["asof"], "dates": dates, "students": j["students"]}
        print(f"{key}: {len(j['students'])} студентов, последнее занятие {j['asof']}")
    stamp = datetime.now(MSK).strftime("%Y-%m-%dT%H:%M")
    (ROOT / "data" / "brs_journal.json").write_text(json.dumps({"source": "журнал группы (xlsx)", "updated": stamp, "subjects": journal}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    brs["subjects"].update(journal)
    brs["updated"] = stamp
    path.write_text(json.dumps(brs, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
