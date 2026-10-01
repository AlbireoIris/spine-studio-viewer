#!/usr/bin/env python3
"""Re-pair a skin whose skeleton JSON and atlas came from different skeletons.

MiMo's extractor picked "the largest JSON" and "the text file containing
bounds:" independently, so a bundle holding several sub-skeletons can end up
with, say, a Vortex skeleton and a Rabbit atlas — every attachment then misses
its atlas region and the whole skin fails to load.

This pulls the bundle again, exports everything, scores each (skeleton, atlas)
pair by how many of the skeleton's attachment names exist as atlas regions and
writes the best pair into the item directory under the existing file names.

Usage: fix_pairing.py <bundle-basename> <item-relative-path>
"""
import json
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path

ADB = r"C:\Users\水月林\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"
CLI = r"C:\Users\水月林\XiaomiMiMoProjects\.mimo-sessions\2026\10\01\https-github-com-aelurum-assetstudiomod-tree\tools\AssetStudioCLI\AssetStudioModCLI_net472_win32_64\AssetStudioModCLI.exe"
DEVICE = "127.0.0.1:16384"
GAME_DIR = "/sdcard/Android/data/com.megagame.crosscore.bilibili/files/Custom"
ROOT = Path(r"D:\AIHOME\Mimo\skins")


def run(cmd, timeout=300):
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    return r.returncode, r.stdout.decode("utf-8", "ignore"), r.stderr.decode("utf-8", "ignore")


def png_size(path: Path):
    try:
        with open(path, "rb") as fh:
            head = fh.read(24)
        if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        w, h = struct.unpack(">II", head[16:24])
        return (w, h)
    except OSError:
        return None


def read_skeleton(path: Path):
    raw = path.read_bytes()
    idx = raw.find(b'"skeleton"')
    if idx < 0:
        return None, None
    brace = raw.rfind(b"{", 0, idx)
    if brace < 0:
        return None, None
    text = raw[brace:].decode("utf-8", "ignore")
    try:
        obj, _end = json.JSONDecoder().raw_decode(text)
    except ValueError:
        return None, None
    if not isinstance(obj, dict) or "skeleton" not in obj:
        return None, None
    return obj, text


def attachment_names(skel):
    names = set()
    for skin in skel.get("skins") or []:
        for slot in (skin.get("attachments") or {}).values():
            names.update(slot.keys())
    return names


def atlas_regions(text):
    names = set()
    for line in text.replace("\x00", "").splitlines():
        s = line.strip()
        if not s or s.startswith(("size:", "filter:", "pma:", "format:", "repeat:", "scale:", "bounds:", "offsets:", "rotate:", "index:")):
            continue
        if re.match(r"^\S.*\.png$", s, re.I):
            continue
        names.add(s)
    return names


def main():
    basename, item = sys.argv[1], sys.argv[2]
    work = Path(r"D:\tmp\repair_pair") / basename
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)
    bundle = work / "b.bundle"
    remote = f"{GAME_DIR}/{basename}"
    code, _out, err = run([ADB, "-s", DEVICE, "pull", remote, str(bundle)])
    if code != 0:
        print("pull failed:", err[:200])
        return 1
    out = work / "out"
    run([CLI, str(bundle), "-m", "export", "-t", "all", "-o", str(out), "-r"])

    files = [p for p in out.rglob("*") if p.is_file()]
    skels, atlases, pngs = [], [], []
    for p in files:
        if p.suffix.lower() == ".png":
            pngs.append(p)
            continue
        if p.suffix.lower() == ".atlas":
            atlases.append((p, p.read_text(encoding="utf-8", errors="ignore")))
            continue
        skel, text = read_skeleton(p)
        if skel is not None:
            skels.append((p, skel, text))
        elif p.suffix.lower() in (".txt", ".json", ".bytes", ".dat") and b"bounds:" in p.read_bytes()[:400]:
            atlases.append((p, p.read_text(encoding="utf-8", errors="ignore")))

    def page_size(atext):
        lines = [l for l in atext.replace("\x00", "").splitlines() if l.strip()]
        for i, l in enumerate(lines[:-1]):
            if re.match(r"^\S.*\.png$", l.strip(), re.I):
                m = re.match(r"^\s*size\s*:\s*(\d+)\s*,\s*(\d+)\s*$", lines[i + 1], re.I)
                if m:
                    return (int(m.group(1)), int(m.group(2)))
        return None

    print(f"skeletons={len(skels)} atlases={len(atlases)} pngs={len(pngs)}")
    best = None
    for sp, skel, text in skels:
        names = attachment_names(skel)
        anims = len(skel.get("animations") or {})
        for ap, atext in atlases:
            regions = atlas_regions(atext)
            hit = len(names & regions)
            score = hit / max(1, len(names))
            if score < 0.9:
                continue
            want = page_size(atext)
            texture = next((q for q in pngs if want and png_size(q) == want), None)
            print(f"  {sp.name} + {ap.name}: {hit}/{len(names)} = {score:.2f} anims={anims} "
                  f"page={want} texture={'ok' if texture else 'MISSING'}")
            if texture is None:
                continue
            key = (score, anims)
            if best is None or key > best[0]:
                best = (key, sp, skel, text, ap, atext, texture)

    if best is None:
        print("no self-consistent (skeleton, atlas, texture) triple found")
        return 1
    _key, sp, skel, text, ap, atext, texture = best
    target = ROOT / item
    json_path = next(target.glob("*.json"))
    atlas_path = next(target.glob("*.atlas"))
    png = next(target.glob("*.png"))

    # write the matching skeleton + atlas, keeping the texture both expect
    atlas_text = atext.replace("\x00", "")
    lines = atlas_text.splitlines()
    first = next(i for i, l in enumerate(lines) if re.match(r"^\S.*\.png$", l.strip(), re.I))
    lines = lines[first:]
    lines[0] = png.name
    atlas_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    json_path.write_text(text.rstrip("\x00") + "\n", encoding="utf-8")
    shutil.copy2(texture, png)
    print(f"applied score={best[0][0]:.2f} anims={best[0][1]}: {sp.name} + {ap.name} + {texture.name} -> {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
