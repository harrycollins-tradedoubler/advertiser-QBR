Set-Location $PSScriptRoot

$existing = Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($procId in $existing) {
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

node .\server.js
