#!/usr/bin/env python3
"""Retry the bundles MiMo's extractor failed on, with two fixes:

1. Skeleton JSON is often exported by AssetStudio as `*.prefab` (the
   MonoBehaviour text field), not as a TextAsset — the original script only
   scanned .json/.dat/.txt/.bytes, so every such skin was reported as
   "no skeleton json found".
2. Multi-page atlases: every page name is rewritten to the texture we actually
   export (page 1 -> <stem>.png, page 2 -> <stem>_p2.png, ...), matched by the
   page size declared in the atlas. The original script rewrote only line 1 and
   copied only the largest PNG, which left page 2 missing (see burtgang).

Usage:
    python extract_retry.py [--include-spinehx] [--limit N] [--only NAME ...]
"""
import argparse
import json
import os
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
WORK = Path(r"D:\tmp\sew_retry")
SRC_LOG = ROOT / "extract-log.jsonl"
RETRY_LOG = ROOT / "extract-retry-log.jsonl"

PAGE_HEADER = re.compile(r"^(.+\.png)\s*$", re.I)
SIZE_LINE = re.compile(r"^size\s*:\s*(\d+)\s*,\s*(\d+)\s*$", re.I)


def run(cmd, timeout=300):
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return r.returncode, r.stdout.decode("utf-8", "ignore"), r.stderr.decode("utf-8", "ignore")
    except Exception as e:  # noqa: BLE001 - report any failure to the caller
        return -1, "", str(e)


def category(name: str) -> str:
    n = name.lower()
    if "spinehx" in n:
        return "spinehx"
    if "_skin_" in n or n.startswith("prefabs_spine_skin"):
        return "skins"
    if "break" in n:
        return "breaks"
    if "_cg" in n or n.startswith("prefabs_spine_cg"):
        return "cg"
    return "characters"


def short_name(basename: str) -> str:
    return basename.replace("prefabs_spine_", "").replace("_spine", "").strip()


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


def find_skeleton(files):
    """Largest embedded Spine skeleton object in any exported file.

    AssetStudio writes a MonoBehaviour's text field verbatim, so a skeleton can
    sit inside a *.prefab whose JSON start is not at byte 0 and may be followed
    by other YAML — decode one complete JSON value instead of regex-matching.
    """
    decoder = json.JSONDecoder()
    best = None
    for p in files:
        try:
            raw = p.read_bytes()
        except OSError:
            continue
        if b'"skeleton"' not in raw:
            continue
        pos = 0
        while True:
            idx = raw.find(b'"skeleton"', pos)
            if idx < 0:
                break
            pos = idx + 10
            brace = raw.rfind(b"{", 0, idx)
            if brace < 0:
                continue
            text = raw[brace:].decode("utf-8", "ignore")
            try:
                obj, end = decoder.raw_decode(text)
            except ValueError:
                continue
            if not isinstance(obj, dict) or not isinstance(obj.get("skeleton"), dict):
                continue
            data = text[:end]
            if best is None or len(data) > len(best[0]):
                best = (data, obj)
            break
    return best


def find_atlas(files):
    """An .atlas export, or any text file that looks like a Spine atlas."""
    candidates = [p for p in files if p.suffix.lower() == ".atlas"]
    for p in files:
        if p in candidates:
            continue
        try:
            head = p.read_bytes()[:800]
        except OSError:
            continue
        if PAGE_HEADER.match(head.split(b"\n", 1)[0].decode("utf-8", "ignore").strip()) and b"size:" in head:
            candidates.append(p)
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_size).read_text(encoding="utf-8", errors="ignore")


def rewrite_atlas(atlas_text: str, stem: str, pngs):
    """Point every page at the texture we export, matched by declared size.

    The exported TextAsset keeps Unity's NUL padding and name header, and
    spine-player treats the first non-empty line as the page name — so that
    header must be dropped, or the whole skin requests "<name>.atlas" as a
    texture and fails to load.
    """
    atlas_text = atlas_text.replace("\x00", "")
    lines = atlas_text.splitlines()

    def is_page(i):
        if i >= len(lines) or not re.match(r"^\S.*\.png$", lines[i], re.I):
            return False
        return i + 1 >= len(lines) or re.match(r"^\s*size\s*:", lines[i + 1], re.I) is not None

    first = next((i for i in range(len(lines)) if is_page(i)), None)
    if first is None:
        return None, []
    lines = lines[first:]

    pages = []  # (line index, declared size)
    for i, line in enumerate(lines):
        if not is_page(i):
            continue
        size = None
        sm = re.match(r"^\s*size\s*:\s*(\d+)\s*,\s*(\d+)\s*$", lines[i + 1], re.I) if i + 1 < len(lines) else None
        if sm:
            size = (int(sm.group(1)), int(sm.group(2)))
        pages.append((i, size))

    used = set()
    mapping = []
    for n, (idx, size) in enumerate(pages, 1):
        target = f"{stem}.png" if n == 1 else f"{stem}_p{n}.png"
        pick = None
        if size:
            for p in pngs:
                if p in used:
                    continue
                if png_size(p) == size:
                    pick = p
                    break
        if pick is None:
            remaining = [p for p in pngs if p not in used]
            if remaining:
                pick = max(remaining, key=lambda p: p.stat().st_size)
        if pick is not None:
            used.add(pick)
        mapping.append((idx, target, pick, size))

    for idx, target, _pick, _size in mapping:
        lines[idx] = target
    return "\n".join(lines) + "\n", mapping


def extract_one(remote: str, basename: str, force: bool = False) -> dict:
    cat = category(basename)
    short = short_name(basename)
    if not short:
        short = basename
    final_dir = ROOT / cat / short
    res = {"name": basename, "short": short, "category": cat, "ok": False, "error": None, "pages": 0}

    json_path = final_dir / f"{basename}.json"
    atlas_path = final_dir / f"{basename}.atlas"
    png_path = final_dir / f"{basename}.png"

    if not force and json_path.exists() and atlas_path.exists():
        res["error"] = "already extracted"
        res["ok"] = True
        res["skipped"] = True
        return res

    bundle = WORK / "bundles" / basename
    out_dir = WORK / "exported" / basename
    raw_dir = Path(str(out_dir) + "_raw")
    try:
        bundle.parent.mkdir(parents=True, exist_ok=True)
        if not bundle.exists() or bundle.stat().st_size < 100:
            code, _, err = run([ADB, "-s", DEVICE, "pull", remote, str(bundle)])
            if code != 0 or not bundle.exists():
                res["error"] = f"pull failed: {err.strip()[:160]}"
                return res

        for d in (out_dir, raw_dir):
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)
        # Export every asset type: skeleton data hides in MonoBehaviours
        # (surfaced as *.prefab) as well as TextAssets.
        run([CLI, str(bundle), "-m", "export", "-t", "all", "-o", str(out_dir), "-r"])
        run([CLI, str(bundle), "-m", "exportRaw", "-t", "textAsset", "-o", str(raw_dir),
             "--not-restore-extension", "-r"])

        files = [p for p in list(out_dir.rglob("*")) + list(raw_dir.rglob("*")) if p.is_file()]
        if not files:
            res["error"] = "nothing exported"
            return res

        skel = find_skeleton(files)
        if skel is None:
            res["error"] = "no skeleton data in any exported asset"
            return res
        skel_text, skel_obj = skel
        skel_bytes = skel_text.encode("utf-8")

        atlas_text = find_atlas(files)
        pngs = sorted([p for p in files if p.suffix.lower() == ".png"], key=lambda p: p.stat().st_size, reverse=True)
        if not pngs:
            res["error"] = "no texture exported"
            return res

        final_dir.mkdir(parents=True, exist_ok=True)
        json_path.write_bytes(skel_bytes if skel_bytes.endswith(b"\n") else skel_bytes + b"\n")

        if atlas_text:
            new_atlas, mapping = rewrite_atlas(atlas_text, basename, pngs)
            atlas_path.write_text(new_atlas, encoding="utf-8")
            for _idx, target, pick, _size in mapping:
                if pick is not None:
                    shutil.copy2(pick, final_dir / target)
            res["pages"] = len(mapping)
        else:
            # No atlas text: emit a single-page atlas so the viewer can still load.
            shutil.copy2(pngs[0], png_path)
            atlas_path.write_text(f"{basename}.png\nsize:{png_size(pngs[0])[0]},{png_size(pngs[0])[1]}\n"
                                  f"filter:Linear,Linear\npma:true\n", encoding="utf-8")
            res["pages"] = 1

        data = skel_obj
        res["anims"] = len(data.get("animations") or {})
        res["bones"] = len(data.get("bones") or [])
        res["spine"] = (data.get("skeleton") or {}).get("spine")
        res["ok"] = True
        return res
    except Exception as e:  # noqa: BLE001
        res["error"] = str(e)[:200]
        return res
    finally:
        # keep disk usage bounded: drop the per-bundle scratch trees
        for d in (out_dir, raw_dir):
            shutil.rmtree(d, ignore_errors=True)


def main():
    # Progress lines can carry BOM/unicode from AssetStudio error text; a GBK
    # console would otherwise abort the whole run on print().
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--include-spinehx", action="store_true",
                    help="also retry prefabs_spinehx_* (they contain no skeleton data)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "bundles").mkdir(exist_ok=True)

    remote_by_name = {}
    for line in Path(r"C:\Users\水月林\XiaomiMiMoProjects\.mimo-sessions\2026\10\01\https-github-com-aelurum-assetstudiomod-tree\game_assets\all-spine-files.txt").read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line:
            remote_by_name[os.path.basename(line)] = line

    failures = []
    for line in SRC_LOG.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        if rec.get("ok"):
            continue
        name = rec.get("name") or ""
        if not name or name not in remote_by_name:
            continue
        if rec.get("category") == "spinehx" and not args.include_spinehx:
            continue
        failures.append((remote_by_name[name], name))

    if args.only:
        wanted = set(args.only)
        failures = [(r, n) for r, n in failures if n in wanted]
    if args.limit:
        failures = failures[: args.limit]

    print(f"retrying {len(failures)} bundle(s)", flush=True)
    ok = fail = 0
    with open(RETRY_LOG, "a", encoding="utf-8") as logf:
        for i, (remote, name) in enumerate(failures, 1):
            print(f"[{i}/{len(failures)}] {name}", flush=True)
            res = extract_one(remote, name, force=args.force)
            if res["ok"]:
                ok += 1
                print(f"  OK anims={res.get('anims')} bones={res.get('bones')} spine={res.get('spine')} pages={res.get('pages')}", flush=True)
            else:
                fail += 1
                print(f"  FAIL {res.get('error')}", flush=True)
            logf.write(json.dumps(res, ensure_ascii=False) + "\n")
            logf.flush()
    print(json.dumps({"retried": len(failures), "ok": ok, "fail": fail}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
