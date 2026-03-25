# Start all services for the Agentic RAG application

Write-Host "Starting Agentic RAG services..." -ForegroundColor Cyan

# Start backend
Write-Host "Starting backend server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "..\backend"
if (Test-Path $backendPath) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; .\.venv\Scripts\Activate.ps1; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8008"
} else {
    Write-Host "Backend folder not found. Run Module 1 first." -ForegroundColor Red
}

# Start frontend
Write-Host "Starting frontend server..." -ForegroundColor Yellow
$frontendPath = Join-Path $PSScriptRoot "..\frontend"
if (Test-Path $frontendPath) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev"
} else {
    Write-Host "Frontend folder not found. Run Module 1 first." -ForegroundColor Red
}

Write-Host ""
Write-Host "Services starting..." -ForegroundColor Green
Write-Host "Backend: http://localhost:8008" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
