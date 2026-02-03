# Stop all services for the Agentic RAG application

Write-Host "Stopping Agentic RAG services..." -ForegroundColor Cyan

# Kill Python/uvicorn processes
Write-Host "Stopping backend processes..." -ForegroundColor Yellow
Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill Node processes on port 5173
Write-Host "Stopping frontend processes..." -ForegroundColor Yellow
$nodeProcesses = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $nodeProcesses) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

# Also kill any stray node processes running vite
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match "vite" -or $_.Path -match "node" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "All services stopped." -ForegroundColor Green
