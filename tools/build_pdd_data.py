#!/usr/bin/env python3
"""Собирает данные тренажёра ПДД из репозитория github.com/etspring/pdd_russia.

Использование:
    git clone --depth 1 https://github.com/etspring/pdd_russia.git /tmp/pdd_russia
    python3 tools/build_pdd_data.py /tmp/pdd_russia pdd/data

Результат:
    data/<ab|cd>/q.json        — все 800 вопросов категории (без картинок)
    data/<ab|cd>/img/NN.json   — картинки билета NN в виде data URI {hash: uri}
    data/signs.json            — дорожные знаки с картинками
    data/markup.json           — дорожная разметка с картинками
"""
import base64
import hashlib
import json
import mimetypes
import re
import sys
from pathlib import Path

CATS = {"ab": "A_B", "cd": "C_D"}


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def norm(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return re.sub(r"(?<=[^\s(])\((Пункт|Пункты|«|Ст\.|Статья|ст\.)", r" (\1", text)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build_category(src: Path, out: Path, key: str, folder: str) -> dict:
    topics: list[str] = []
    questions = []
    chunks: dict[int, dict[str, str]] = {}
    for ticket in range(1, 41):
        raw = json.loads((src / "questions" / folder / "tickets" / f"Билет {ticket}.json").read_text(encoding="utf-8"))
        if len(raw) != 20:
            raise SystemExit(f"{folder} билет {ticket}: {len(raw)} вопросов вместо 20")
        raw.sort(key=lambda q: int(re.search(r"\d+", q["title"]).group()))
        for num, q in enumerate(raw, 1):
            correct = [i for i, a in enumerate(q["answers"]) if a["is_correct"]]
            if len(correct) != 1:
                raise SystemExit(f"{folder} билет {ticket} вопрос {num}: правильных ответов {len(correct)}")
            img = ""
            rel = q.get("image") or ""
            if rel and "no_image" not in rel:
                p = (src / rel).resolve()
                if not p.is_file() or src.resolve() not in p.parents:
                    raise SystemExit(f"нет картинки {rel}")
                img = p.stem
                chunks.setdefault(ticket, {})[img] = data_uri(p)
            tix = []
            for t in q.get("topic") or ["Прочее"]:
                if t not in topics:
                    topics.append(t)
                tix.append(topics.index(t))
            questions.append({
                "id": q.get("id") or hashlib.md5(q["question"].encode()).hexdigest(),
                "t": ticket,
                "n": num,
                "q": norm(q["question"]),
                "img": img,
                "a": [norm(a["answer_text"]) for a in q["answers"]],
                "c": correct[0],
                "tip": norm(q.get("answer_tip")),
                "tp": tix,
            })
    for ticket, chunk in chunks.items():
        write_json(out / key / "img" / f"{ticket:02d}.json", chunk)
    write_json(out / key / "q.json", {"topics": topics, "q": questions})
    return {"questions": len(questions), "images": sum(len(c) for c in chunks.values())}


def build_reference(src: Path, out: Path, name: str) -> int:
    raw = json.loads((src / name / f"{name}.json").read_text(encoding="utf-8"))
    groups, total = [], 0
    for group, items in raw.items():
        rows = []
        for item in items.values():
            p = (src / (item.get("image") or "")).resolve()
            rows.append({
                "n": item.get("number") or "",
                "t": norm(item.get("title") or ""),
                "d": norm(item.get("description") or ""),
                "img": data_uri(p) if p.is_file() else "",
            })
        groups.append({"g": group, "items": rows})
        total += len(rows)
    write_json(out / f"{name}.json", groups)
    return total


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    for key, folder in CATS.items():
        print(key, build_category(src, out, key, folder))
    print("signs", build_reference(src, out, "signs"))
    print("markup", build_reference(src, out, "markup"))


if __name__ == "__main__":
    main()
