# Open the Spine Studio asset viewer (D:\AIHOME\Mimo).
#
# ASCII-only on purpose: Windows PowerShell reads a BOM-less .ps1 as ANSI, so
# non-ASCII literals here would be mangled (the bundled Python path contains
# CJK characters and lives in the MIMO_PYTHON user environment variable).
$ErrorActionPreference = 'SilentlyContinue'
$root = 'D:\AIHOME\Mimo'
$url = 'http://localhost:8877/viewer-studio/index.html'
$port = 8877

function Test-Listening([int] $p) {
  return [bool] (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Listening $port)) {
  Write-Host "static server not running on port $port - starting it"
  $python = $env:MIMO_PYTHON
  if (-not $python -or -not (Test-Path $python)) {
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
  }
  if (-not $python) {
    Write-Host 'No Python found. Set MIMO_PYTHON to a python.exe, or start any static server rooted at D:\AIHOME\Mimo on port 8877.'
    exit 1
  }
  Start-Process -FilePath $python `
    -ArgumentList '-m', 'http.server', "$port", '--bind', '127.0.0.1', '--directory', $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$root\viewer-studio\server-8877.log" `
    -RedirectStandardError "$root\viewer-studio\server-8877.log.err"
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 300
    if (Test-Listening $port) { break }
  }
  if (-not (Test-Listening $port)) { Write-Host 'server did not come up'; exit 1 }
  Write-Host "server started (pid $(Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess))"
}
else {
  Write-Host "static server already running on port $port"
}

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
  Write-Host "opening $url in Chrome"
  Start-Process -FilePath $chrome -ArgumentList $url
}
else {
  Write-Host "Chrome not found - opening $url with the default browser"
  Start-Process $url
}
