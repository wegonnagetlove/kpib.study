#!/usr/bin/env python3
"""Импорт выгрузки Craft («Рабочий стол группы») в content/ и data/.

Выгрузка получается командой Craft `blocks get <rootBlockId> --format markdown --depth 6`
и сохраняется в файл. Запуск:

    python3 scripts/import_craft.py path/to/craft_export.txt

Скрипт перезаписывает content/pages, content/subjects и data/{tree,events}.json.
Пароли и токены из текста вырезаются, в публичный репозиторий они не попадают.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TOKEN = re.compile(
    r'<page id="(?P<id>[^"]*)"(?P<attrs>[^>]*)>\s*<pageTitle>(?P<title>.*?)</pageTitle>'
    r'|</page>',
    re.S,
)

TRANSLIT = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r",
     "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"],
))

# Короткие коды дисциплин, как их называют в группе
SUBJECT_CODES = {
    "Проблемы теории государства и права": "ptgp",
    "История отечественного правоведения": "iop",
    "Актуальные проблемы информационного права": "apip",
    "Правовое регулирование отношений в сети Интернет": "proi",
    "Конституционное развитие России": "krr",
    "Правовые вопросы доступа к информации": "pvdi",
    "Иностранный язык": "eng",
    "Философия права": "filpr",
}

SECTION_SLUGS = {
    "ДЗ": "hw",
    "Контакты и беседы": "contacts",
    "Баллы (БРС) только кафедральные предметы": "brs",
    "Дисциплины": "subjects",
    "Расписание": "schedule",
    "ВКР": "vkr",
    "Конференции, конкурсы и НИР": "events",
}

MONTHS = {"сентября": "09", "октября": "10", "ноября": "11", "декабря": "12",
          "января": "01", "февраля": "02", "марта": "03", "апреля": "04", "мая": "05"}

EVENT_FIELDS = {"": "date", "_2": "deadline", "_3": "type", "_4": "format", "_5": "role",
                "_6": "fit", "_7": "subjects", "_8": "points", "_9": "certificate",
                "_10": "url", "_11": "status"}


def clean_title(t: str) -> str:
    return re.sub(r"\*+", "", html.unescape(t)).strip()


def slugify(t: str) -> str:
    t = clean_title(t).lower()
    m = re.match(r"(?:лекция от\s+)?(\d{1,2})[ .](\S+)", t)
    if m:
        day, mon = m.group(1), m.group(2)
        mon = MONTHS.get(mon, mon if mon.isdigit() else None)
        if mon:
            return f"{mon}-{int(day):02d}"
    out = "".join(TRANSLIT.get(c, c) for c in t)
    out = re.sub(r"[^a-z0-9]+", "-", out).strip("-")
    return out or "page"


def parse(text: str):
    root = {"id": None, "title": "", "attrs": "", "children": [], "parts": []}
    stack = [root]
    pos = 0
    for m in TOKEN.finditer(text):
        stack[-1]["parts"].append(text[pos:m.start()])
        if m.group("id") is not None:
            node = {"id": m.group("id"), "title": clean_title(m.group("title")),
                    "attrs": m.group("attrs"), "children": [], "parts": []}
            stack[-1]["children"].append(node)
            stack[-1]["parts"].append(f"\n[[child:{node['id']}]]\n")
            stack.append(node)
        else:
            stack.pop()
        pos = m.end()
    stack[-1]["parts"].append(text[pos:])
    return root["children"][0]


SECRET_PATTERNS = [
    (re.compile(r"(пароль\s*:?\s*)(`[^`]*`|[^\s,;<`]+)", re.I), r"\1хранится в секретах репозитория"),
]


def redact(s: str) -> str:
    for rx, rep in SECRET_PATTERNS:
        s = rx.sub(rep, s)
    return s


def to_markdown(node, link_for) -> str:
    body = "".join(node["parts"])
    body = re.sub(r"</?content>", "", body)
    # В Craft иногда вставляется текст с буквальными «\n» вместо переносов (списки, таблицы)
    body = re.sub(r"\\n(?=\s*(?:[-*>|#]|\d+[.)]\s|\*\*))", "\n", body)
    body = re.sub(r"([^\n|])\n(\|[^\n]*\|\n\|\s*-{3})", r"\1\n\n\2", body)
    body = re.sub(r"<collection>.*?</collection>", "\n[[events-table]]\n", body, flags=re.S)
    # Вложенные страницы превращаются в ссылки
    def child(m):
        c = next((x for x in node["children"] if x["id"] == m.group(1)), None)
        return f"\n- [{c['title']}]({link_for(c)})\n" if c else ""
    body = re.sub(r"\[\[child:([^\]]+)\]\]", child, body)
    # <callout> оставляем как блок-выноску, <highlight> как <mark>
    body = re.sub(r"<callout>(.*?)</callout>",
                  lambda m: f'\n<div class="callout" markdown>\n\n{m.group(1).strip()}\n\n</div>\n', body, flags=re.S)
    body = re.sub(r'<highlight color="(\w+)">', r'<mark class="hl-\1">', body)
    body = body.replace("</highlight>", "</mark>")
    # Убираем отступы, иначе markdown примет текст за код
    lines = [ln.strip() for ln in body.splitlines()]
    body = "\n".join(lines)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    # Ссылки без протокола
    body = re.sub(r"\]\((?!https?://|mailto:|#|tel:)([a-z0-9.-]+\.[a-z]{2,}[^)]*)\)", r"](https://\1)", body)
    return redact(body) + "\n"


def excerpt(md: str, n: int = 320) -> str:
    t = re.sub(r"^#{1,6} .*$", "", md, flags=re.M)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"^\s*(#{1,6}|[-*+]|\d+[.)]|>)\s*", "", t, flags=re.M)
    t = re.sub(r"\|[^\n]*", "", t)
    t = re.sub(r"[*_`]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"


def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main(src: str):
    text = Path(src).read_text(encoding="utf-8")
    top = parse(text)

    # Лекции, написанные в редакторе сайта (source: site), не затираем
    site_pages = {}
    old_tree = ROOT / "data/tree.json"
    if old_tree.exists():
        for subj in json.loads(old_tree.read_text(encoding="utf-8")).get("subjects", []):
            for pg in subj["pages"]:
                f = ROOT / f"content/subjects/{subj['code']}/{pg['slug']}.md"
                if pg.get("source") == "site" and f.exists():
                    site_pages[(subj["code"], pg["slug"])] = (pg, f.read_text(encoding="utf-8"))

    for d in ("content/pages", "content/subjects"):
        p = ROOT / d
        if p.exists():
            for f in p.rglob("*.md"):
                f.unlink()

    links = {}

    def link_for(n):
        return links.get(n["id"], "#/")

    # Ссылки на все страницы заранее
    for sec in top["children"]:
        sslug = SECTION_SLUGS.get(sec["title"], slugify(sec["title"]))
        links[sec["id"]] = f"#/{sslug}"
        if sslug == "subjects":
            for subj in sec["children"]:
                code = SUBJECT_CODES.get(subj["title"], slugify(subj["title"]))
                links[subj["id"]] = f"#/s/{code}"
                def walk(n, prefix):
                    for c in n["children"]:
                        cs = prefix + slugify(c["title"])
                        links[c["id"]] = f"#/s/{code}/{cs}"
                        walk(c, cs + "--")
                walk(subj, "")

    tree = {"title": top["title"], "craftId": top["id"], "home": to_markdown(top, link_for), "sections": [], "subjects": []}
    write(ROOT / "content/pages/home.md", tree.pop("home"))

    events = []
    for sec in top["children"]:
        sslug = SECTION_SLUGS.get(sec["title"], slugify(sec["title"]))
        tree["sections"].append({"slug": sslug, "title": sec["title"], "id": sec["id"]})
        write(ROOT / f"content/pages/{sslug}.md", to_markdown(sec, link_for))
        if sslug == "events":
            for item in re.findall(r"<collectionItem>(.*?)</collectionItem>", "".join(sec["parts"]), re.S):
                ev = {"title": html.unescape(re.search(r"<title>(.*?)</title>", item, re.S).group(1).strip())}
                for k, v in re.findall(r'<property name="([^"]*)">(.*?)</property>', item, re.S):
                    ev[EVENT_FIELDS.get(k, k)] = html.unescape(v.strip())
                if ev.get("subjects"):
                    ev["subjects"] = [s.strip() for s in ev["subjects"].split(",")]
                if ev.get("points"):
                    ev["points"] = int(ev["points"])
                events.append(ev)
        if sslug == "subjects":
            for subj in sec["children"]:
                code = SUBJECT_CODES.get(subj["title"], slugify(subj["title"]))
                entry = {"code": code, "title": subj["title"], "id": subj["id"], "pages": []}
                write(ROOT / f"content/subjects/{code}/index.md", to_markdown(subj, link_for))

                def walk(n, prefix, depth):
                    for c in n["children"]:
                        cs = prefix + slugify(c["title"])
                        md = to_markdown(c, link_for)
                        write(ROOT / f"content/subjects/{code}/{cs}.md", md)
                        entry["pages"].append({"slug": cs, "title": c["title"], "id": c["id"], "depth": depth,
                                               "lecture": c["title"].lower().startswith("лекция"),
                                               "empty": len(md.strip()) < 40 and not c["children"],
                                               "chars": len(md), "excerpt": excerpt(md)})
                        walk(c, cs + "--", depth + 1)
                walk(subj, "", 0)
                for (c, slug), (pg, md) in site_pages.items():
                    if c != code:
                        continue
                    i = next((k for k, x in enumerate(entry["pages"]) if x["slug"] == slug), None)
                    if i is not None and not entry["pages"][i].get("empty"):
                        print(f"внимание: {code}/{slug} есть и в Craft, и на сайте; оставлена версия с сайта")
                    write(ROOT / f"content/subjects/{code}/{slug}.md", md)
                    if i is None:
                        entry["pages"].append(pg)
                    else:
                        entry["pages"][i] = pg
                other = [x for x in entry["pages"] if not x["lecture"]]
                lec = sorted((x for x in entry["pages"] if x["lecture"]), key=lambda x: x["slug"])
                entry["pages"] = other + lec
                tree["subjects"].append(entry)

    # мероприятия, добавленные на сайте (source: site), импорт из Craft не затирает
    try:
        kept = [e for e in json.loads((ROOT / "data/events.json").read_text(encoding="utf-8")) if e.get("source") == "site"]
    except (OSError, ValueError):
        kept = []
    seen = {(e.get("date"), e.get("title", "").lower()) for e in events}
    events += [e for e in kept if (e.get("date"), e.get("title", "").lower()) not in seen]
    events.sort(key=lambda e: e.get("date") or e.get("deadline") or "9999")
    write(ROOT / "data/tree.json", json.dumps(tree, ensure_ascii=False, indent=1))
    write(ROOT / "data/events.json", json.dumps(events, ensure_ascii=False, indent=1))
    n = sum(len(s["pages"]) for s in tree["subjects"])
    print(f"разделов: {len(tree['sections'])}, дисциплин: {len(tree['subjects'])}, "
          f"страниц конспектов: {n}, мероприятий: {len(events)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
