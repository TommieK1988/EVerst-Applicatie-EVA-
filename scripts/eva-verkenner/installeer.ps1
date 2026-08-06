<#
.SYNOPSIS
  Zet de EVA-protocolhandler klaar, zodat "Open in Verkenner" in EVA werkt.

.DESCRIPTION
  Kopieert eva-verkenner.ps1 naar %LOCALAPPDATA%\EVA en registreert het
  eva://-protocol onder HKEY_CURRENT_USER. Geen beheerdersrechten nodig.

.PARAMETER Verwijderen
  Maakt de installatie ongedaan.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installeer.ps1
#>

[CmdletBinding()]
param(
  [switch]$Verwijderen
)

$ErrorActionPreference = 'Stop'

$doelMap    = Join-Path $env:LOCALAPPDATA 'EVA'
$doelScript = Join-Path $doelMap 'eva-verkenner.ps1'
$protocol   = 'HKCU:\Software\Classes\eva'

if ($Verwijderen) {
  if (Test-Path $protocol)   { Remove-Item $protocol -Recurse -Force }
  if (Test-Path $doelScript) { Remove-Item $doelScript -Force }
  Write-Host 'EVA-protocolhandler verwijderd.' -ForegroundColor Green
  return
}

$bron = Join-Path $PSScriptRoot 'eva-verkenner.ps1'
if (-not (Test-Path -LiteralPath $bron)) {
  throw "eva-verkenner.ps1 staat niet naast dit script ($PSScriptRoot)."
}

if (-not (Test-Path -LiteralPath $doelMap)) {
  New-Item -ItemType Directory -Path $doelMap | Out-Null
}
Copy-Item -LiteralPath $bron -Destination $doelScript -Force

# Windows geeft de aangeklikte URI door als %1. Met -File is dat altijd data,
# nooit uitvoerbare code — vervang dit niet door -Command.
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$commando   = "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$doelScript`" -Uri `"%1`""

New-Item -Path $protocol -Force | Out-Null
Set-ItemProperty -Path $protocol -Name '(default)'   -Value 'URL:EVA'
Set-ItemProperty -Path $protocol -Name 'URL Protocol' -Value ''

$commandoSleutel = Join-Path $protocol 'shell\open\command'
New-Item -Path $commandoSleutel -Force | Out-Null
Set-ItemProperty -Path $commandoSleutel -Name '(default)' -Value $commando

Write-Host 'EVA-protocolhandler geïnstalleerd.' -ForegroundColor Green
Write-Host "  Script:  $doelScript"
Write-Host '  Sluit de browser en open hem opnieuw, dan werkt "Open in Verkenner".'
