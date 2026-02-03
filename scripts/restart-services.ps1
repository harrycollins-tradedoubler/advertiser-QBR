# Restart all services for the Agentic RAG application

Write-Host "Restarting Agentic RAG services..." -ForegroundColor Cyan

# Stop services first
$stopScript = Join-Path $PSScriptRoot "stop-services.ps1"
& $stopScript

Start-Sleep -Seconds 2

# Start services
$startScript = Join-Path $PSScriptRoot "start-services.ps1"
& $startScript
