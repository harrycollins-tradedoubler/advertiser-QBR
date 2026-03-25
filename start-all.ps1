# start-all.ps1
# One-command startup for AgentHub + Presenton + Cloudflare

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

if (-not (Test-Path "$repo\.env")) {
  "OPENAI_API_KEY=" | Set-Content "$repo\.env"
  Write-Host "Created .env. Add your OPENAI_API_KEY in $repo\.env" -ForegroundColor Yellow
}

# Build + start containers
Write-Host "Starting Docker compose..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "\nServices:" -ForegroundColor Green
Write-Host "- AgentHub API: http://localhost:8008"
Write-Host "- AgentHub UI:  http://localhost:5173"
Write-Host "- Presenton UI: http://localhost:5000"
Write-Host "- Presenton API: http://localhost:5000/api/v1/ppt/presentation/generate"
Write-Host "- n8n: remote instance (not started by this script)"

# Start Cloudflare tunnel for Presenton
Write-Host "\nStarting Cloudflare tunnel for Presenton (leave this window open)..." -ForegroundColor Yellow
cloudflared tunnel --url http://127.0.0.1:5000 --protocol http2 --edge-ip-version 4
