Set-Location $PSScriptRoot

$port = 3011

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($procId in $existing) {
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

$env:PORT = "$port"
node .\server.js
