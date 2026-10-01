#!/usr/bin/env python3
"""Batch extract Spine triples from Cross Core UnityFS bundles via AssetStudioCLI."""
import os, sys, json, re, shutil, subprocess, struct
from pathlib import Path

ADB = r"C:\Users\水月林\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"
CLI = r"C:\Users\水月林\XiaomiMiMoProjects\.mimo-sessions\2026\10\01\https-github-com-aelurum-assetstudiomod-tree\tools\AssetStudioCLI\AssetStudioModCLI_net472_win32_64\AssetStudioModCLI.exe"
DEVICE = "127.0.0.1:16384"
GAME_DIR = "/sdcard/Android/data/com.megagame.crosscore.bilibili/files/Custom"
ROOT = Path(r"D:\AIHOME\Mimo\skins")
WORK = Path(r"D:\tmp\sew")  # short path to avoid Windows MAX_PATH issues
LIST = Path(r"C:\Users\水月林\XiaomiMiMoProjects\.mimo-sessions\2026\10\01\https-github-com-aelurum-assetstudiomod-tree\game_assets\all-spine-files.txt")

def run(cmd, timeout=180):
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return r.returncode, r.stdout.decode("utf-8", "ignore"), r.stderr.decode("utf-8", "ignore")
    except Exception as e:
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

def clean_skeleton_json(raw: bytes) -> bytes | None:
    """Strip Unity TextAsset name header, return pure Spine JSON."""
    for needle in (b'{"skeleton":', b'{"skeleton"'):
        idx = raw.find(needle)
        if idx >= 0:
            data = raw[idx:].rstrip(b"\x00")
            return data
    # fallback: first '{' after ascii name header
    idx = raw.find(b'{')
    if idx >= 0:
        data = raw[idx:].rstrip(b"\x00")
        if b'"skeleton"' in data[:200]:
            return data
    return None

def extract_one(remote_path: str, basename: str) -> dict:
    """Pull + export + normalize. Returns status dict."""
    result = {"name": basename, "ok": False, "files": [], "error": None, "category": category(basename)}
    local_bundle = WORK / "bundles" / basename
    out_dir = WORK / "exported" / basename
    # shorter final folder name to keep paths under MAX_PATH
    short = basename.replace("prefabs_spine_", "").replace("_spine", "")
    final_dir = ROOT / result["category"] / short
    result["short_name"] = short
    try:
        local_bundle.parent.mkdir(parents=True, exist_ok=True)
        if not local_bundle.exists() or local_bundle.stat().st_size < 100:
            code, _, err = run([ADB, "-s", DEVICE, "pull", remote_path, str(local_bundle)], timeout=300)
            if code != 0 or not local_bundle.exists():
                result["error"] = f"pull failed: {err}"
                return result

        # export text + texture
        if out_dir.exists():
            shutil.rmtree(out_dir, ignore_errors=True)
        out_dir.mkdir(parents=True, exist_ok=True)
        code, out, err = run([
            CLI, str(local_bundle),
            "-m", "export",
            "-t", "textAsset,tex2d",
            "-o", str(out_dir),
            "-r",
        ], timeout=240)
        # always also raw-export TextAssets (skeleton JSON lives here)
        code2, out2, err2 = run([
            CLI, str(local_bundle),
            "-m", "exportRaw",
            "-t", "textAsset",
            "-o", str(out_dir) + "_raw",
            "--not-restore-extension",
            "-r",
        ], timeout=240)

        # find files recursively
        texts = []
        pngs = []
        for p in out_dir.rglob("*"):
            if not p.is_file():
                continue
            name = p.name.lower()
            if name.endswith(".png"):
                pngs.append(p)
            elif name.endswith(".atlas") or name.endswith(".json") or name.endswith(".dat") or name.endswith(".txt") or name.endswith(".bytes"):
                texts.append(p)
        raw_dir = Path(str(out_dir) + "_raw")
        if raw_dir.exists():
            for p in raw_dir.rglob("*"):
                if p.is_file() and p.suffix.lower() in (".dat", ".bytes", ".txt", ".json", ".atlas"):
                    texts.append(p)

        if not texts and not pngs:
            result["error"] = "no text/png exported"
            return result

        # classify texts: atlas vs skeleton
        atlas_src = None
        skel_src = None
        for t in texts:
            raw = t.read_bytes()
            if b"bounds:" in raw[:200] or (raw.startswith(b"78050") and b"\nsize:" in raw[:200]) or (b"\nsize:" in raw[:500] and b"filter:" in raw[:800]):
                if atlas_src is None:
                    atlas_src = raw
            if b'{"skeleton"' in raw or b'{"skeleton":' in raw:
                # prefer largest (animation data)
                if skel_src is None or len(raw) > len(skel_src):
                    skel_src = raw
            # .atlas extension
            if t.suffix.lower() == ".atlas" and atlas_src is None:
                atlas_src = raw

        # fallback: if only one text and looks like atlas
        if atlas_src is None:
            for t in texts:
                raw = t.read_bytes()
                if b"bounds:" in raw:
                    atlas_src = raw
                    break

        if skel_src is None:
            result["error"] = "no skeleton json found"
            return result

        skel_clean = clean_skeleton_json(skel_src)
        if not skel_clean:
            result["error"] = "failed to clean skeleton json"
            return result

        # pick png (prefer name match or largest)
        png_src = None
        if pngs:
            pngs_sorted = sorted(pngs, key=lambda p: p.stat().st_size, reverse=True)
            png_src = pngs_sorted[0]

        if atlas_src is None and png_src is None:
            result["error"] = "missing atlas and png"
            return result

        # write final triple
        if final_dir.exists():
            shutil.rmtree(final_dir, ignore_errors=True)
        final_dir.mkdir(parents=True, exist_ok=True)

        # normalize names to short skin name
        stem = short
        json_path = final_dir / f"{stem}.json"
        atlas_path = final_dir / f"{stem}.atlas"
        png_path = final_dir / f"{stem}.png"

        json_path.write_bytes(skel_clean)

        if atlas_src:
            # ensure atlas page name points to our png name
            try:
                atlas_text = atlas_src.decode("utf-8", "ignore")
                # first non-empty line is page name
                lines = atlas_text.splitlines()
                if lines:
                    lines[0] = f"{stem}.png"
                    atlas_text = "\n".join(lines)
                    if not atlas_text.endswith("\n"):
                        atlas_text += "\n"
                atlas_path.write_text(atlas_text, encoding="utf-8")
            except Exception:
                atlas_path.write_bytes(atlas_src)
        else:
            # minimal atlas if texture exists
            if png_src:
                atlas_path.write_text(f"{stem}.png\n", encoding="utf-8")

        if png_src:
            shutil.copy2(png_src, png_path)
        else:
            result["error"] = "no png texture"
            # still keep json+atlas
            result["files"] = [str(json_path), str(atlas_path)]
            # verify json
            try:
                data = json.loads(skel_clean.decode("utf-8"))
                result["ok"] = True
                result["anims"] = len(data.get("animations", {}))
                result["note"] = "no png"
            except Exception as e:
                result["error"] = f"json invalid: {e}"
            return result

        # validate
        try:
            data = json.loads(skel_clean.decode("utf-8"))
            result["anims"] = len(data.get("animations", {}))
            result["bones"] = len(data.get("bones", []))
            result["ok"] = True
            result["files"] = [str(json_path), str(atlas_path), str(png_path)]
        except Exception as e:
            result["error"] = f"json invalid: {e}"
        return result
    except Exception as e:
        result["error"] = str(e)
        return result

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "bundles").mkdir(exist_ok=True)
    (WORK / "exported").mkdir(exist_ok=True)

    lines = [ln.strip() for ln in LIST.read_text(encoding="utf-8", errors="ignore").splitlines() if ln.strip()]
    # dedupe basename
    seen = set()
    jobs = []
    for ln in lines:
        base = os.path.basename(ln)
        if not base or base in seen:
            continue
        seen.add(base)
        jobs.append((ln, base))

    # priority: skins, breaks, characters, cg, spinehx
    prio = {"skins": 0, "breaks": 1, "characters": 2, "cg": 3, "spinehx": 4}
    jobs.sort(key=lambda x: (prio.get(category(x[1]), 9), x[1]))

    log_path = ROOT / "extract-log.jsonl"
    summary_path = ROOT / "summary.json"
    results = []
    ok = fail = 0
    with open(log_path, "w", encoding="utf-8") as logf:
        for i, (remote, base) in enumerate(jobs, 1):
            print(f"[{i}/{len(jobs)}] {base}", flush=True)
            res = extract_one(remote, base)
            results.append(res)
            if res["ok"]:
                ok += 1
                print(f"  OK  anims={res.get('anims')} files={len(res.get('files') or [])}", flush=True)
            else:
                fail += 1
                print(f"  FAIL {res.get('error')}", flush=True)
            logf.write(json.dumps(res, ensure_ascii=False) + "\n")
            logf.flush()

    # summary by category
    cats = {}
    for r in results:
        c = r.get("category", "other")
        cats.setdefault(c, {"ok": 0, "fail": 0})
        if r["ok"]:
            cats[c]["ok"] += 1
        else:
            cats[c]["fail"] += 1

    summary = {
        "total": len(results),
        "ok": ok,
        "fail": fail,
        "categories": cats,
    }
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)

if __name__ == "__main__":
    main()
