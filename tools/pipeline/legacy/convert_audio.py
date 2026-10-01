#!/usr/bin/env python3
"""Convert CRI acb/awb to wav/mp3 using vgmstream, optionally copy next to skins."""
import os, subprocess, sys
from pathlib import Path

VG = r"D:\AIHOME\Mimo\tools\vgmstream\vgmstream-cli.exe"
FF = r"D:\AIHOME\Mimo\tools\ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe"
ADB = r"C:\Users\水月林\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"
DEV = "127.0.0.1:16384"
SND = "/sdcard/Android/data/com.megagame.crosscore.bilibili/files/sounds"
LOCAL = Path(r"D:\AIHOME\Mimo\audio")
SKINS = Path(r"D:\AIHOME\Mimo\skins")

def run(cmd):
    return subprocess.run(cmd, capture_output=True)

def convert_one(acb: Path) -> bool:
    wav = acb.with_suffix(".wav")
    if wav.exists() and wav.stat().st_size > 1000:
        return True
    r = run([VG, "-o", str(wav), str(acb)])
    return wav.exists() and wav.stat().st_size > 1000

def main():
    LOCAL.mkdir(parents=True, exist_ok=True)
    # list remote audio
    r = run([ADB, "-s", DEV, "shell", f"find {SND} -type f \\( -name '*.acb' -o -name '*.awb' \\) 2>/dev/null"])
    lines = [ln.strip() for ln in r.stdout.decode("utf-8", "ignore").splitlines() if ln.strip()]
    print("remote audio files:", len(lines))
    ok = fail = 0
    for i, remote in enumerate(lines, 1):
        name = os.path.basename(remote)
        local = LOCAL / name
        if not local.exists() or local.stat().st_size < 100:
            run([ADB, "-s", DEV, "pull", remote, str(local)])
        if not local.exists():
            fail += 1
            continue
        if local.suffix.lower() == ".acb":
            if convert_one(local):
                ok += 1
                print(f"[{i}/{len(lines)}] OK {name}")
            else:
                fail += 1
                print(f"[{i}/{len(lines)}] FAIL {name}")
        else:
            ok += 1
    print(f"done ok={ok} fail={fail}")

if __name__ == "__main__":
    main()
