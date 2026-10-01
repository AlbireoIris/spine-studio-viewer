#!/usr/bin/env python3
"""Build viewer-studio/manifest.json from the extracted skins (v2).

Improvements over the original build_manifest.py:
  * validates each triple (skeleton JSON parses, every atlas page texture is
    actually present) and prefers the valid copy;
  * deduplicates the two directory generations that exist on disk
    (`<short>/` and `prefabs_spine_<short>_spine/`) into ONE list entry, so the
    viewer no longer shows the same skin twice, once of them broken;
  * drops directories whose names carry stray whitespace (Windows cannot open
    them anyway);
  * keeps every genuinely distinct skin.

A backup of the previous manifest is written next to it.
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(r"D:\AIHOME\Mimo\skins")
OUT = Path(r"D:\AIHOME\Mimo\viewer-studio\manifest.json")
CATEGORIES = ["skins", "breaks", "characters", "cg", "spinehx"]

PAGE = re.compile(r"^(.+\.png)\s*$", re.I)
ATTR = ("size:", "filter:", "pma:", "format:", "repeat:", "scale:", "bounds:", "offsets:", "rotate:", "index:")


def atlas_regions(text: str):
    """Region names declared in an atlas (page headers and attribute lines out)."""
    names = set()
    for line in text.replace("\x00", "").splitlines():
        s = line.strip()
        if not s or s.lower().startswith(ATTR):
            continue
        if PAGE.match(s):
            continue
        names.add(s)
    return names


def attachment_names(data):
    names = set()
    for skin in (data.get("skins") or []):
        for slot in (skin.get("attachments") or {}).values():
            names.update(slot.keys())
    return names


def atlas_pages(atlas: Path):
    pages = []
    try:
        lines = atlas.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return pages
    for i, line in enumerate(lines):
        m = PAGE.match(line.strip())
        if not m:
            continue
        nxt = lines[i + 1].strip().lower() if i + 1 < len(lines) else ""
        if nxt.startswith("size:"):
            pages.append(m.group(1))
    return pages


def inspect(d: Path):
    """Return (ok, info) for one skin directory."""
    jsons = sorted(d.glob("*.json"))
    atlases = sorted(d.glob("*.atlas"))
    pngs = sorted(d.glob("*.png"))
    if not jsons:
        return False, None
    info = {"anims": 0, "bones": 0, "animNames": [], "json": None, "atlas": None, "png": None,
            "missingPages": [], "pages": 0, "regionCoverage": None}
    parsed = None
    for j in jsons:
        try:
            data = json.loads(j.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(data, dict) or "skeleton" not in data:
            continue
        info["json"] = j.name
        info["anims"] = len(data.get("animations") or {})
        info["bones"] = len(data.get("bones") or [])
        info["animNames"] = list((data.get("animations") or {}).keys())[:50]
        parsed = data
        break
    if not info["json"]:
        return False, None
    if atlases:
        a = atlases[0]
        info["atlas"] = a.name
        text = a.read_text(encoding="utf-8", errors="ignore")
        pages = atlas_pages(a)
        info["pages"] = len(pages)
        names = {p.name.lower() for p in pngs}
        info["missingPages"] = [p for p in pages if p.lower() not in names]
        # A skeleton whose attachments are absent from its atlas fails to load
        # with "Region not found in atlas", so this is a validity signal — and
        # the one that keeps a mis-paired copy from winning the dedupe.
        want = attachment_names(parsed)
        if want:
            have = atlas_regions(text)
            info["regionCoverage"] = len(want & have) / len(want)
    if pngs:
        info["png"] = pngs[0].name
    # usable = skeleton parses, all atlas pages exist, and the atlas actually
    # contains the regions the skeleton draws
    ok = (bool(info["json"]) and bool(info["atlas"]) and bool(info["png"])
          and not info["missingPages"]
          and (info["regionCoverage"] is None or info["regionCoverage"] >= 0.9))
    return ok, info


def logical_key(dirname: str) -> str:
    return dirname.replace("prefabs_spine_", "").replace("_spine", "").strip().lower()


def score(info):
    # prefer the copy whose skeleton actually draws something and fits its atlas
    return (info.get("regionCoverage") or 0, info["anims"] > 0, info["bones"] > 0, info["anims"], info["bones"])


def main():
    best = {}
    dropped = {"invalid": [], "whitespace": []}
    for cat in CATEGORIES:
        base = ROOT / cat
        if not base.exists():
            continue
        for d in sorted(base.iterdir()):
            if not d.is_dir():
                continue
            if d.name != d.name.strip():
                dropped["whitespace"].append(f"{cat}/{d.name}")
                continue
            ok, info = inspect(d)
            if not ok:
                dropped["invalid"].append(f"{cat}/{d.name}")
                continue
            key = (cat, logical_key(d.name))
            entry = {
                "id": d.name,
                "name": d.name.replace("prefabs_spine_", "").replace("_spine", "").strip(),
                "category": cat,
                "group": logical_key(d.name),
                "json": info["json"],
                "atlas": info["atlas"],
                "png": info["png"],
                "anims": info["anims"],
                "bones": info["bones"],
                "animNames": info["animNames"],
                "path": f"{cat}/{d.name}",
                "pages": info["pages"],
            }
            prev = best.get(key)
            if prev is None or score(info) > score(prev["_info"]):
                if prev is not None:
                    dropped["duplicate"] = dropped.get("duplicate", [])
                    dropped["duplicate"].append(prev["path"])
                entry["_info"] = info
                best[key] = entry

    items = []
    for entry in best.values():
        entry.pop("_info", None)
        items.append(entry)
    items.sort(key=lambda e: (CATEGORIES.index(e["category"]), e["name"].lower()))

    if OUT.exists():
        shutil.copy2(OUT, OUT.with_suffix(".json.bak"))
    OUT.write_text(json.dumps({"count": len(items), "items": items}, ensure_ascii=False, indent=2), encoding="utf-8")

    report = {
        "items": len(items),
        "droppedDuplicates": len(dropped.get("duplicate", [])),
        "droppedInvalid": len(dropped["invalid"]),
        "droppedWhitespace": len(dropped["whitespace"]),
        "byCategory": {c: sum(1 for i in items if i["category"] == c) for c in CATEGORIES},
        "sampleInvalid": dropped["invalid"][:15],
        "sampleDuplicate": dropped.get("duplicate", [])[:10],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
