$ErrorActionPreference = "Stop"

$backendPython = "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $backendPython)) {
  $backendPython = "python"
}

$root = (Resolve-Path ".").Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$backendPythonCommand = if (Test-Path $backendPython) { (Resolve-Path $backendPython).Path } else { "python" }

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  "Set-Location '$backendDir'; & '$backendPythonCommand' -m uvicorn app.main:app --reload --port 8000"
) -WindowStyle Normal

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  "Set-Location '$frontendDir'; npm.cmd run dev"
) -WindowStyle Normal

Write-Host "Backend starting on http://localhost:8000"
Write-Host "Frontend starting on http://localhost:3000"
