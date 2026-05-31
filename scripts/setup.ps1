$ErrorActionPreference = "Stop"

if (-not (Test-Path "backend\.env")) {
  Copy-Item "backend\.env.example" "backend\.env"
  Write-Host "Created backend\.env"
}

if (-not (Test-Path "frontend\.env.local")) {
  Copy-Item "frontend\.env.example" "frontend\.env.local"
  Write-Host "Created frontend\.env.local"
}

if (-not (Test-Path "backend\.venv")) {
  python -m venv backend\.venv
  Write-Host "Created backend\.venv"
}

& "backend\.venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
npm --prefix frontend install

Write-Host ""
Write-Host "Setup complete."
Write-Host "Add your OpenAI key to backend\.env as OPENAI_API_KEY."
Write-Host "Run both apps with: npm run dev"
