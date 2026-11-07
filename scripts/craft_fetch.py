#!/usr/bin/env python3
"""Забирает документ «Рабочий стол группы» через Craft API и сохраняет markdown для import_craft.py.

Адрес API берётся из переменной CRAFT_API_URL (секрет репозитория), например
https://connect.craft.do/links/<код>/api/v1 . Запуск:

    CRAFT_API_URL=... python3 scripts/craft_fetch.py craft_export.txt
"""
import json
import os
import sys
import urllib.request

TITLE = os.environ.get("CRAFT_DOC_TITLE", "Рабочий стол группы")


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "kpib-study-sync"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def main(out):
    base = os.environ.get("CRAFT_API_URL", "").strip().rstrip("/")
    if not base:
        print("CRAFT_API_URL не задан, синхронизация пропущена")
        return 2
    if not base.endswith("/api/v1"):
        base = base.split("/api/")[0].replace("/link/", "/links/") + "/api/v1"
    docs = json.loads(get(base + "/documents"))["items"]
    doc = next((d for d in docs if d.get("title", "").strip() == TITLE and not d.get("isDeleted")), None)
    if not doc:
        live = [d for d in docs if not d.get("isDeleted")]
        if len(live) != 1:
            sys.exit(f"в подключении нет документа «{TITLE}»: {[d.get('title') for d in docs]}")
        doc = live[0]
    md = get(f"{base}/blocks?id={doc['id']}&maxDepth=6", accept="text/markdown")
    if not md.startswith("<page id=") or md.count("<pageTitle>") < 10:
        sys.exit("ответ Craft не похож на выгрузку документа, импорт отменён")
    open(out, "w", encoding="utf-8").write(md)
    print(f"«{doc.get('title')}»: {len(md)} символов, страниц {md.count('<pageTitle>')}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
