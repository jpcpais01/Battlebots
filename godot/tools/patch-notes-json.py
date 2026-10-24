#!/usr/bin/env python3
"""The newest patch notes (src/patchNotes.ts PATCH_NOTES) as JSON, for the Android release.

The app's update card (godot/app/update) shows a new build's notes before it's installed: the
release workflow attaches this as patch-notes.json, [{hour, title, notes: [...]}, ...] newest
first.
    python3 godot/tools/patch-notes-json.py out.json [groups]
"""
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src" / "patchNotes.ts"


def literal(s, i):
    """The JS string literal starting at s[i] (a quote) and the index after it."""
    q = s[i]
    out = []
    i += 1
    while s[i] != q:
        c = s[i]
        if c == "\\":
            n = s[i + 1]
            if n == "u":
                out.append(chr(int(s[i + 2:i + 6], 16)))
                i += 6
                continue
            out.append({"n": "\n", "t": "\t", "r": "\r", "0": "\0"}.get(n, n))
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out), i + 1


def groups(src):
    start = src.index("PATCH_NOTES")
    i = src.index("[", src.index("=", start)) + 1
    depth = 1
    key = None
    cur = None
    out = []
    while depth > 0:
        c = src[i]
        if c in "\"'":
            v, i = literal(src, i)
            if key in ("hour", "title"):
                cur[key] = v
                key = None
            elif key == "notes":
                cur["notes"].append(v)
            continue
        if src.startswith("//", i):
            i = src.index("\n", i)
            continue
        if src.startswith("/*", i):
            i = src.index("*/", i) + 2
            continue
        if c == "{" and depth == 1:
            cur = {"hour": "", "title": "", "notes": []}
        elif c == "}" and depth == 1:
            out.append(cur)
            cur = None
        elif c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            key = None
        elif c.isalpha() and cur is not None and key != "notes":
            j = i
            while src[j].isalnum() or src[j] == "_":
                j += 1
            word = src[i:j]
            if word in ("hour", "title", "notes"):
                key = word
            i = j
            continue
        i += 1
    return out


def main():
    out = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    g = groups(SRC.read_text(encoding="utf-8"))[:n]
    assert g and all(p["hour"] and p["title"] and p["notes"] for p in g), "couldn't read PATCH_NOTES"
    Path(out).write_text(json.dumps(g, ensure_ascii=False), encoding="utf-8")
    print(f"{out}: {len(g)} groups, newest {g[0]['hour']} {g[0]['title']!r}")


if __name__ == "__main__":
    main()
