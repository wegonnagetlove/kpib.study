#!/usr/bin/env python3
"""Снимок таблицы БРС (Google Sheets) в репозиторий.

data/brs/<id>.csv  точные копии ответов gviz, которые запрашивает калькулятор brs/
                   (нужны, если Google недоступен из браузера);
data/brs.json      итоги по журналам для основного сайта (лента, профиль, сессия).

Источник истины один: листы журнала (ПРОИ, ПВДИ, АПИП, ФилПр), столбец ИТОГО.
Если какой-то лист не скачался, прежний снимок не трогаем.
"""
import csv, io, json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

SHEET_ID = "1Ibgbp67ott3PQ05LWFKuNsUUFS-343ctYclRpxP0UzI"
BASE = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv"
# id файла: (лист, параметр headers как в калькуляторе)
SHEETS = {
    "summary": ("Баллы", None),
    "sched": ("Расписание", 1),
    "proi": ("ПРОИ", 2),
    "pvdi": ("ПВДИ", 2),
    "apip": ("АПИП", 2),
    "filpr": ("ФилПр", 2),
}
JOURNALS = {"proi": "Экзамен", "pvdi": "Экзамен", "apip": "Экзамен", "filpr": "Зачёт"}
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "brs"
MSK = timezone(timedelta(hours=3))
DATE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")


def url(sheet, headers):
    u = BASE + ("&headers=%d" % headers if headers is not None else "")
    return u + "&sheet=" + urllib.parse.quote(sheet)


def fetch(u):
    last = None
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "kpib-bot"}), timeout=30) as r:
                t = r.read().decode("utf-8")
            if t.lstrip().startswith("<"):
                raise RuntimeError("Google вернул HTML (нет доступа к таблице?)")
            return t
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    raise last


def num(v):
    try:
        return float(str(v).replace(",", ".").strip())
    except ValueError:
        return None


def iso(v):
    m = DATE.search(v or "")
    return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}" if m else None


def parse_journal(text):
    rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text))]
    hi = next((i for i, r in enumerate(rows) if any("фио" in c.lower() for c in r)), 0)
    head = [c.lower() for c in rows[hi]]
    name = next(j for j, c in enumerate(head) if "фио" in c)
    tot = next((j for j, c in enumerate(head) if "итого" in c), None)
    dop = [j for j, c in enumerate(head) if re.search(r"(^|\s)доп(\s|$)", c)]
    dates = [(j, iso(c)) for j, c in enumerate(rows[hi]) if iso(c) and j not in dop and j != tot]
    body = [r for r in rows[hi + 1:] if len(r) > name and len(r[name].split()) >= 2]
    # занятие считается прошедшим, если хоть кому-то за него что-то стоит
    held = [(j, d) for j, d in dates if any(j < len(r) and r[j] != "" for r in body)]
    out = {}
    for r in body:
        cell = lambda j: r[j] if j is not None and j < len(r) else ""  # noqa: E731
        vals = [num(cell(j)) for j, _ in dates]
        total = num(cell(tot))
        extra = sum(num(cell(j)) or 0 for j in dop)
        if total is None:
            total = sum(v or 0 for v in vals) + extra
        out[r[name]] = {
            "total": round(total, 2),
            "extra": round(extra, 2),
            "present": sum(1 for j, _ in held if num(cell(j))),
            "missed": sum(1 for j, _ in held if num(cell(j)) is None),
        }
    return {
        "held": [d for _, d in held],
        "asof": max((d for _, d in held), default=None),
        "dates": sorted(d for _, d in dates),
        "students": out,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    got, errors = {}, []
    for key, (sheet, h) in SHEETS.items():
        try:
            got[key] = fetch(url(sheet, h))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{sheet}: {e}")
    for key, t in got.items():
        (OUT / f"{key}.csv").write_text(t, encoding="utf-8")

    path = ROOT / "data" / "brs.json"
    old = json.loads(path.read_text("utf-8")) if path.exists() else {"subjects": {}}
    subjects = dict(old.get("subjects", {}))
    for key, kind in JOURNALS.items():
        if key in got:
            try:
                subjects[key] = {"kind": kind, **parse_journal(got[key])}
            except Exception as e:  # noqa: BLE001
                errors.append(f"{key}: разбор {e}")
    data = {
        "source": f"https://docs.google.com/spreadsheets/d/{SHEET_ID}",
        "subjects": subjects,
    }
    # дату снимка меняем только если что-то изменилось, чтобы не плодить коммиты
    stamp = old.get("updated")
    if json.dumps(old.get("subjects"), sort_keys=True, ensure_ascii=False) != json.dumps(subjects, sort_keys=True, ensure_ascii=False) or not stamp:
        stamp = datetime.now(MSK).strftime("%Y-%m-%dT%H:%M")
    data["updated"] = stamp
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for k, s in subjects.items():
        print(f"{k}: {len(s['students'])} студентов, последнее занятие {s['asof']}")
    if errors:
        print("Ошибки:", *errors, sep="\n  ")
    if not got:
        sys.exit(1)


if __name__ == "__main__":
    main()
