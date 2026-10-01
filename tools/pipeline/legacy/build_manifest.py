#!/usr/bin/env python3
"""Scan extracted skins and emit manifest.json for the viewer."""
import json, os, re
from pathlib import Path

ROOT = Path(r"D:\AIHOME\Mimo\skins")
OUT = Path(r"D:\AIHOME\Mimo\viewer-studio\manifest.json")

def main():
    items = []
    for cat in ["skins", "breaks", "characters", "cg", "spinehx"]:
        base = ROOT / cat
        if not base.exists():
            continue
        for d in sorted(base.iterdir()):
            if not d.is_dir():
                continue
            jsons = list(d.glob("*.json"))
            atlases = list(d.glob("*.atlas"))
            pngs = list(d.glob("*.png"))
            if not jsons:
                continue
            j = jsons[0]
            atlas = atlases[0].name if atlases else None
            png = pngs[0].name if pngs else None
            anims = 0
            bones = 0
            try:
                data = json.loads(j.read_text(encoding="utf-8"))
                anims = len(data.get("animations") or {})
                bones = len(data.get("bones") or [])
                anim_names = list((data.get("animations") or {}).keys())
            except Exception:
                anim_names = []
            # group multi-form: strip trailing a/b/c
            m = re.match(r"^(prefabs_spine_.+?)([abc])?$", d.name)
            group = d.name
            m2 = re.search(r"(skin_.+?)\d*([abc])?_spine$", d.name)
            if m2:
                group = m2.group(1).rstrip("0123456789")
            items.append({
                "id": d.name,
                "name": d.name.replace("prefabs_spine_", "").replace("_spine", ""),
                "category": cat,
                "group": group,
                "json": j.name,
                "atlas": atlas,
                "png": png,
                "anims": anims,
                "bones": bones,
                "animNames": anim_names[:50],
                "path": f"{cat}/{d.name}",
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"count": len(items), "items": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("manifest items:", len(items))

if __name__ == "__main__":
    main()
