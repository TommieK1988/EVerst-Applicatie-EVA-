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

  Het script is idempotent: opnieuw draaien overschrijft gewoon. Het schrijft
  zijn versienummer naar HKLM\SOFTWARE\EVA\Versie (of HKCU), zodat Intune aan
  die waarde kan zien of deze uitgave al op de pc staat.

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

# Verhoog dit bij elke wijziging aan eva-verkenner.ps1 en pas de detectieregel
# in Intune mee aan — anders denkt Intune dat de nieuwe uitgave er al op staat
# en rolt hij hem nooit uit. Zie LEESMIJ.md.
$Versie = '1.0.0'

# Intune start PowerShell standaard in de 32-bits host (en een oudere GPO-omgeving
# soms ook). Daar wijst $env:ProgramFiles naar "Program Files (x86)" en belandt
# alles wat we onder HKLM\SOFTWARE schrijven in ...\WOW6432Node — precies waar de
# 64-bits Verkenner en browser nooit kijken. De installatie lijkt dan te slagen
# terwijl de knop nergens werkt. Daarom eerst onszelf herstarten in de 64-bits
# host; Sysnative is het pad dat alleen een 32-bits proces daarvoor kan gebruiken.
if (-not [Environment]::Is64BitProcess -and [Environment]::Is64BitOperatingSystem) {
  $ps64 = Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
  if (-not (Test-Path -LiteralPath $ps64)) {
    throw 'Dit script draait 32-bits en de 64-bits PowerShell is niet te vinden. Start opnieuw vanuit een 64-bits PowerShell.'
  }
  $argumenten = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($Machine)     { $argumenten += ' -Machine' }
  if ($Verwijderen) { $argumenten += ' -Verwijderen' }
  Write-Host 'Opnieuw starten in de 64-bits PowerShell...' -ForegroundColor DarkGray
  $opnieuw = Start-Process -FilePath $ps64 -ArgumentList $argumenten -Wait -PassThru -NoNewWindow
  exit $opnieuw.ExitCode
}

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
$doelControle = Join-Path $doelMap 'controleer.ps1'
$appSleutel   = Join-Path $wortel 'EVA'
$protocol     = Join-Path $classes 'eva'
$progId       = Join-Path $classes 'EVA.Verkenner'
$capabilities = Join-Path $wortel 'EVA\Capabilities'
$registered   = Join-Path $wortel 'RegisteredApplications'

if ($Verwijderen) {
  foreach ($k in @($protocol, $progId, $appSleutel)) {
    if (Test-Path $k) { Remove-Item $k -Recurse -Force }
  }
  if (Test-Path $registered) {
    Remove-ItemProperty -Path $registered -Name 'EVA' -ErrorAction SilentlyContinue
  }
  foreach ($b in @($doelScript, $doelControle)) {
    if (Test-Path -LiteralPath $b) { Remove-Item -LiteralPath $b -Force }
  }
  # De map alleen opruimen als er niets meer in staat. Bij een gebruikers-
  # installatie ligt het logboek hier ook, en dat is juist het bewijsmateriaal
  # bij een storing — dat gooien we niet ongevraagd weg.
  if ((Test-Path -LiteralPath $doelMap) -and -not (Get-ChildItem -LiteralPath $doelMap -Force)) {
    Remove-Item -LiteralPath $doelMap -Force
  }
  Write-Host "EVA-protocolhandler verwijderd ($bereik)." -ForegroundColor Green
  exit 0
}

$bron = Join-Path $PSScriptRoot 'eva-verkenner.ps1'
if (-not (Test-Path -LiteralPath $bron)) {
  throw "eva-verkenner.ps1 staat niet naast dit script ($PSScriptRoot)."
}

if (-not (Test-Path -LiteralPath $doelMap)) {
  New-Item -ItemType Directory -Path $doelMap | Out-Null
}
Copy-Item -LiteralPath $bron -Destination $doelScript -Force

# controleer.ps1 gaat mee zodat een collega bij een storing niets uit de repo
# nodig heeft. Ontbreekt het (ouder pakket), dan is dat geen reden om de
# installatie te laten mislukken.
$bronControle = Join-Path $PSScriptRoot 'controleer.ps1'
if (Test-Path -LiteralPath $bronControle) {
  Copy-Item -LiteralPath $bronControle -Destination $doelControle -Force
}

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
#
#    De ouder-sleutel eerst, zodat het versienummer er staat voordat de
#    onderliggende Capabilities worden geschreven.
Zet-Sleutel $appSleutel @{ 'Versie' = $Versie }
Zet-Sleutel $capabilities @{
  'ApplicationName'        = 'EVA'
  'ApplicationDescription' = 'Opent dossiermappen uit EVA in Verkenner.'
}
Zet-Sleutel (Join-Path $capabilities 'URLAssociations') @{ 'eva' = 'EVA.Verkenner' }

# De verwijzing is een registerpad zonder hive-voorvoegsel.
$capabilitiesPad = ($capabilities -replace '^HK(LM|CU):\\', '')
Zet-Sleutel $registered @{ 'EVA' = $capabilitiesPad }

Write-Host "EVA-protocolhandler geïnstalleerd ($bereik), versie $Versie." -ForegroundColor Green
Write-Host "  Script:  $doelScript"
Write-Host "  Sleutel: $protocol"
Write-Host '  Sluit de browser volledig af en open hem opnieuw, dan werkt "Open in Verkenner".'
if (Test-Path -LiteralPath $doelControle) {
  Write-Host "  Controleren: powershell -ExecutionPolicy Bypass -File `"$doelControle`""
}

if ($Machine -and (Test-Path 'HKCU:\Software\Classes\eva')) {
  Write-Host ''
  Write-Host 'Let op: er staat ook nog een installatie voor de huidige gebruiker.' -ForegroundColor Yellow
  Write-Host 'Die gaat voor op de machine-brede registratie. Verwijderen kan met:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Verwijderen' -ForegroundColor Yellow
}

# Expliciet, zodat Intune en GPO een ondubbelzinnige exitcode terugkrijgen.
exit 0
