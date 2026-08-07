<#
.SYNOPSIS
  Zet de EVA-protocolhandler klaar, zodat "Open in Verkenner" in EVA werkt.

.DESCRIPTION
  Kopieert eva-verkenner.ps1 naar de doelmap en registreert het eva://-protocol.

  Twee smaken:
    - standaard      : alleen voor de huidige gebruiker (%LOCALAPPDATA%\EVA +
                       HKEY_CURRENT_USER). Geen beheerdersrechten nodig.
    - -Machine       : voor iedereen op de pc (%ProgramFiles%\EVA +
                       HKEY_LOCAL_MACHINE). Vereist beheerdersrechten en is de
                       aangewezen vorm voor uitrol via Intune of GPO.

  Program Files is bewust gekozen voor de machine-installatie: daar kan een
  gewone gebruiker het script niet wijzigen. Zou het ergens staan waar dat wel
  kan, dan kon iemand code laten uitvoeren bij elke andere gebruiker van die pc.

.PARAMETER Machine
  Installeert (of verwijdert) machine-breed in plaats van per gebruiker.

.PARAMETER Verwijderen
  Maakt de installatie ongedaan.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installeer.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Machine
#>

[CmdletBinding()]
param(
  [switch]$Machine,
  [switch]$Verwijderen
)

$ErrorActionPreference = 'Stop'

function Test-Beheerder {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Machine -and -not (Test-Beheerder)) {
  throw 'Een machine-brede installatie vereist beheerdersrechten. Start PowerShell als administrator, of rol dit uit als machine-script via Intune/GPO.'
}

if ($Machine) {
  $doelMap  = Join-Path $env:ProgramFiles 'EVA'
  $protocol = 'HKLM:\SOFTWARE\Classes\eva'
  $bereik   = 'voor alle gebruikers van deze pc'
} else {
  $doelMap  = Join-Path $env:LOCALAPPDATA 'EVA'
  $protocol = 'HKCU:\Software\Classes\eva'
  $bereik   = 'voor de huidige gebruiker'
}
$doelScript = Join-Path $doelMap 'eva-verkenner.ps1'

if ($Verwijderen) {
  if (Test-Path $protocol)   { Remove-Item $protocol -Recurse -Force }
  if (Test-Path $doelScript) { Remove-Item $doelScript -Force }
  Write-Host "EVA-protocolhandler verwijderd ($bereik)." -ForegroundColor Green
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
Set-ItemProperty -Path $protocol -Name '(default)'    -Value 'URL:EVA'
Set-ItemProperty -Path $protocol -Name 'URL Protocol' -Value ''

$commandoSleutel = Join-Path $protocol 'shell\open\command'
New-Item -Path $commandoSleutel -Force | Out-Null
Set-ItemProperty -Path $commandoSleutel -Name '(default)' -Value $commando

Write-Host "EVA-protocolhandler geïnstalleerd ($bereik)." -ForegroundColor Green
Write-Host "  Script:  $doelScript"
Write-Host "  Sleutel: $protocol"
Write-Host '  Sluit de browser volledig af en open hem opnieuw, dan werkt "Open in Verkenner".'

if ($Machine -and (Test-Path 'HKCU:\Software\Classes\eva')) {
  Write-Host ''
  Write-Host 'Let op: er staat ook nog een installatie voor de huidige gebruiker.' -ForegroundColor Yellow
  Write-Host 'Die gaat voor op de machine-brede registratie. Verwijderen kan met:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Verwijderen' -ForegroundColor Yellow
}
