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
  $doelMap      = Join-Path $env:ProgramFiles 'EVA'
  $wortel       = 'HKLM:\SOFTWARE'
  $classes      = 'HKLM:\SOFTWARE\Classes'
  $bereik       = 'voor alle gebruikers van deze pc'
} else {
  $doelMap      = Join-Path $env:LOCALAPPDATA 'EVA'
  $wortel       = 'HKCU:\Software'
  $classes      = 'HKCU:\Software\Classes'
  $bereik       = 'voor de huidige gebruiker'
}
$doelScript   = Join-Path $doelMap 'eva-verkenner.ps1'
$protocol     = Join-Path $classes 'eva'
$progId       = Join-Path $classes 'EVA.Verkenner'
$capabilities = Join-Path $wortel 'EVA\Capabilities'
$registered   = Join-Path $wortel 'RegisteredApplications'

if ($Verwijderen) {
  foreach ($k in @($protocol, $progId, (Join-Path $wortel 'EVA'))) {
    if (Test-Path $k) { Remove-Item $k -Recurse -Force }
  }
  if (Test-Path $registered) {
    Remove-ItemProperty -Path $registered -Name 'EVA' -ErrorAction SilentlyContinue
  }
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

function Zet-Sleutel([string]$Pad, [hashtable]$Waarden) {
  New-Item -Path $Pad -Force | Out-Null
  foreach ($naam in $Waarden.Keys) {
    Set-ItemProperty -Path $Pad -Name $naam -Value $Waarden[$naam]
  }
}

# 1. Het protocol zelf. Dit is wat ShellExecute gebruikt (Win+R, Start-Process).
Zet-Sleutel $protocol @{ '(default)' = 'URL:EVA'; 'URL Protocol' = '' }
Zet-Sleutel (Join-Path $protocol 'shell\open\command') @{ '(default)' = $commando }

# 2. Dezelfde handler nog eens als benoemd programma (ProgID).
Zet-Sleutel $progId @{ '(default)' = 'EVA — dossiermap openen in Verkenner'; 'URL Protocol' = '' }
Zet-Sleutel (Join-Path $progId 'shell\open\command') @{ '(default)' = $commando }

# 3. Aanmelden als applicatie die het eva-protocol afhandelt.
#
#    Zonder dit werkt het protocol wél via ShellExecute, maar niet vanuit een
#    browser: Chrome en het Windows-dialoog "Hoe wil je dit openen?" kijken naar
#    RegisteredApplications, niet naar de kale klasse-registratie. Een klik in
#    EVA doet dan niets, of levert "Uw pc heeft geen app die deze koppeling kan
#    openen" op. OneDrive registreert zijn odopen-protocol op dezelfde manier.
Zet-Sleutel $capabilities @{
  'ApplicationName'        = 'EVA'
  'ApplicationDescription' = 'Opent dossiermappen uit EVA in Verkenner.'
}
Zet-Sleutel (Join-Path $capabilities 'URLAssociations') @{ 'eva' = 'EVA.Verkenner' }

# De verwijzing is een registerpad zonder hive-voorvoegsel.
$capabilitiesPad = ($capabilities -replace '^HK(LM|CU):\\', '')
Zet-Sleutel $registered @{ 'EVA' = $capabilitiesPad }

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
