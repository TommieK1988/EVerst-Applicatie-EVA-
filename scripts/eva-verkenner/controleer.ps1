<#
.SYNOPSIS
  Controleert op deze pc of "Open in Verkenner" uit EVA werkt.

.DESCRIPTION
  Loopt de hele keten langs en zegt per stap wat er goed of mis is:

    1. Is het eva://-protocol geregistreerd (machine-breed en/of per gebruiker)?
    2. Is EVA aangemeld onder RegisteredApplications? Zonder die aanmelding
       werkt het protocol wél via Win+R, maar doet een klik in de browser niets.
    3. Bestaat het script waar de registratie naar wijst, wordt het met -File
       aangeroepen, en staat het als UTF-8 mét BOM op schijf?
    4. Welk pad zou de handler kiezen voor een echte map-URL?
    5. Staat er iets in het logboek?

  Die laatste stap is de belangrijkste bij "er gebeurt niets". De handler draait
  onzichtbaar, dus alleen het logboek laat zien of de klik de pc überhaupt heeft
  bereikt. Een leeg of ontbrekend logboek betekent dat Windows de handler nooit
  gestart heeft — dan zit het probleem in de registratie of in de browser, niet
  in de handler zelf.

  Met -Proef vuurt dit script zelf een eva://-adres af en kijkt of het logboek
  meegroeit. Dat bewijst de ShellExecute-kant los van de browser; er kan een
  mapvenster opengaan.

  Draai dit als de aangemelde gebruiker, niet als SYSTEM: de registratie per
  gebruiker, de OneDrive-koppelingen en het logboek zijn allemaal per account.

.PARAMETER Url
  De SharePoint-map-URL waarmee de padbepaling getest wordt. Standaard de map
  waar de dossiermappen onder hangen, zodat de uitslag iets zegt over echt
  gebruik. De map hoeft niet te bestaan om het pad te kunnen tonen — geef een
  bestaande dossiermap mee als je ook de OneDrive-herkenning wilt natrekken.

.PARAMETER Proef
  Vuurt daadwerkelijk een eva://-adres af en controleert of het logboek groeit.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\controleer.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\controleer.ps1 -Proef
#>

[CmdletBinding()]
param(
  [string]$Url = 'https://evertsgroep.sharepoint.com/sites/DeRekenkamer/Shared%20Documents/Calculaties/Begrotingen',
  [switch]$Proef
)

$ErrorActionPreference = 'Stop'

$script:fouten         = 0
$script:waarschuwingen = 0

function Goed([string]$Tekst)      { Write-Host "  [ok] $Tekst" -ForegroundColor Green }
function Waarschuw([string]$Tekst) { $script:waarschuwingen++; Write-Host "  [!]  $Tekst" -ForegroundColor Yellow }
function Mis([string]$Tekst)       { $script:fouten++;         Write-Host "  [X]  $Tekst" -ForegroundColor Red }
function Kop([string]$Tekst)       { Write-Host ''; Write-Host $Tekst -ForegroundColor Cyan }
function Info([string]$Tekst)      { Write-Host "       $Tekst" -ForegroundColor DarkGray }

<# Standaardwaarde van een registersleutel, of $null als de sleutel niet bestaat. #>
function Lees-Standaard([string]$Pad) {
  try { return (Get-ItemProperty -LiteralPath $Pad -ErrorAction Stop).'(default)' } catch { return $null }
}

<# Eén benoemde registerwaarde, of $null. #>
function Lees-Waarde([string]$Pad, [string]$Naam) {
  try { return (Get-ItemProperty -LiteralPath $Pad -ErrorAction Stop).$Naam } catch { return $null }
}

Write-Host 'EVA — controle "Open in Verkenner"' -ForegroundColor White
Info ("pc $env:COMPUTERNAME, gebruiker $env:USERNAME, " + (Get-Date -Format 'dd-MM-yyyy HH:mm'))

# ---------------------------------------------------------------- 1. protocol
Kop '1. Registratie van het eva://-protocol'

$machineCmd   = Lees-Standaard 'HKLM:\SOFTWARE\Classes\eva\shell\open\command'
$gebruikerCmd = Lees-Standaard 'HKCU:\Software\Classes\eva\shell\open\command'

if ($machineCmd) { Goed 'machine-breed geregistreerd (HKLM)' }
else             { Waarschuw 'niet machine-breed geregistreerd; deze pc heeft geen uitrol gehad' }

if ($gebruikerCmd) { Goed 'geregistreerd voor deze gebruiker (HKCU)' }

if (-not $machineCmd -and -not $gebruikerCmd) {
  Mis 'Het eva://-protocol is helemaal niet geregistreerd. Installeer eerst met installeer.ps1.'
}
if ($machineCmd -and $gebruikerCmd) {
  Waarschuw 'Er staat zowel een gebruikers- als een machine-installatie; die van de gebruiker wint.'
  Info      'Opruimen kan met: installeer.ps1 -Verwijderen'
}

$commando = if ($gebruikerCmd) { $gebruikerCmd } else { $machineCmd }
$hive     = if ($gebruikerCmd) { 'HKCU' } else { 'HKLM' }
if ($commando) { Info "actief ($hive): $commando" }

# -------------------------------------------------------------- 2. aanmelding
Kop '2. Aanmelding als applicatie (dit is wat de browser leest)'

if ($commando) {
  $wortel  = if ($hive -eq 'HKCU') { 'HKCU:\Software' }         else { 'HKLM:\SOFTWARE' }
  $classes = if ($hive -eq 'HKCU') { 'HKCU:\Software\Classes' } else { 'HKLM:\SOFTWARE\Classes' }

  $aangemeld = Lees-Waarde (Join-Path $wortel 'RegisteredApplications') 'EVA'
  if ($aangemeld) { Goed "aangemeld onder RegisteredApplications ($aangemeld)" }
  else {
    Mis 'EVA staat niet in RegisteredApplications.'
    Info 'Win+R met een eva://-adres werkt dan wel, maar een klik in de browser doet niets.'
  }

  $koppeling = Lees-Waarde (Join-Path $wortel 'EVA\Capabilities\URLAssociations') 'eva'
  if ($koppeling -eq 'EVA.Verkenner') { Goed 'URLAssociations koppelt eva aan EVA.Verkenner' }
  else { Mis "URLAssociations\eva ontbreekt of wijst verkeerd (gevonden: '$koppeling')." }

  if (Lees-Standaard (Join-Path $classes 'EVA.Verkenner\shell\open\command')) { Goed 'ProgID EVA.Verkenner bestaat' }
  else { Mis 'ProgID EVA.Verkenner ontbreekt.' }

  $versie = Lees-Waarde (Join-Path $wortel 'EVA') 'Versie'
  if ($versie) { Info "geïnstalleerde versie: $versie" }
} else {
  Info 'overgeslagen: er is geen registratie om te controleren.'
}

# ------------------------------------------------------------------ 3. script
Kop '3. Het script waar de registratie naar wijst'

$handler = $null
if ($commando) {
  if ($commando -match '(?i)\s-Command(\s|$)') {
    Mis 'De registratie gebruikt -Command in plaats van -File. Opnieuw installeren met installeer.ps1.'
  }
  $treffer = [regex]::Match($commando, '(?i)-File\s+"([^"]+)"')
  if ($treffer.Success) {
    $handler = $treffer.Groups[1].Value
    if (Test-Path -LiteralPath $handler) {
      Goed "script aanwezig: $handler"
      $bom = @(Get-Content -LiteralPath $handler -Encoding Byte -TotalCount 3 -ErrorAction SilentlyContinue)
      if ($bom.Count -eq 3 -and $bom[0] -eq 0xEF -and $bom[1] -eq 0xBB -and $bom[2] -eq 0xBF) {
        Goed 'opgeslagen als UTF-8 met BOM'
      } else {
        Waarschuw 'het script mist de UTF-8-BOM; accenten in de meldingen verminken dan.'
      }
    } else {
      Mis "het script ontbreekt op $handler"
      $handler = $null
    }
  } else {
    Mis 'in de registratie staat geen -File "..."-verwijzing.'
  }
}

if (-not $handler) {
  $naast = Join-Path $PSScriptRoot 'eva-verkenner.ps1'
  if (Test-Path -LiteralPath $naast) {
    $handler = $naast
    Info "val terug op het script naast dit bestand: $handler"
  }
}

# ------------------------------------------------------------- 4. padbepaling
Kop '4. Welk pad zou de handler kiezen'
Info $Url

$testUri = 'eva://map?url=' + [uri]::EscapeDataString($Url)

if ($handler) {
  $uitBestand  = [IO.Path]::GetTempFileName()
  $foutBestand = [IO.Path]::GetTempFileName()
  try {
    # Via een apart proces, zodat dit precies zo loopt als wanneer Windows de
    # handler start. Uitvoer naar bestanden i.p.v. 2>&1: Windows PowerShell 5.1
    # maakt van elke stderr-regel van een exe anders een ErrorRecord.
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $argumenten = "-NoProfile -ExecutionPolicy Bypass -File `"$handler`" -Controleer -Uri `"$testUri`""
    $proces = Start-Process -FilePath $powershell -ArgumentList $argumenten -Wait -PassThru -NoNewWindow `
                            -RedirectStandardOutput $uitBestand -RedirectStandardError $foutBestand
    $uitvoer = Get-Content -LiteralPath $uitBestand  -Raw -ErrorAction SilentlyContinue
    $foutje  = Get-Content -LiteralPath $foutBestand -Raw -ErrorAction SilentlyContinue

    if ($proces.ExitCode -eq 0 -and $uitvoer) {
      foreach ($regel in ($uitvoer -split "`r?`n" | Where-Object { $_.Trim() })) { Info $regel.Trim() }
      if ($uitvoer -match 'OneDrive') {
        Goed 'de bibliotheek is met OneDrive gesynchroniseerd; de map opent lokaal'
      } else {
        Waarschuw 'geen OneDrive-sync gevonden; de handler valt terug op WebDAV.'
        Info 'Op deze tenant is dat een doodlopend pad: SharePoint Online laat Verkenner'
        Info 'niet meer toe op \\...@SSL\DavWWWRoot\..., ook niet met een draaiende'
        Info 'WebClient-service. Laat deze gebruiker de bibliotheek synchroniseren;'
        Info 'tot die tijd toont EVA na de klik zelf het lokale pad in een dialoog.'
      }
    } else {
      Mis 'de handler kon dit adres niet omzetten naar een pad.'
      if ($foutje) { Info $foutje.Trim() }
    }
  } finally {
    Remove-Item -LiteralPath $uitBestand, $foutBestand -Force -ErrorAction SilentlyContinue
  }
} else {
  Mis 'geen handler-script om te testen.'
}

# ----------------------------------------------------------------- 5. logboek
Kop '5. Logboek'

$logBestand = Join-Path $env:LOCALAPPDATA 'EVA\eva-verkenner.log'
Info $logBestand

$regels = @()
if (Test-Path -LiteralPath $logBestand) {
  $regels = @(Get-Content -LiteralPath $logBestand -ErrorAction SilentlyContinue)
}

if ($regels.Count) {
  Goed "$($regels.Count) regel(s) gelogd"
  foreach ($regel in ($regels | Select-Object -Last 3)) { Info $regel }

  # De handler is fail-soft: hij logt wat er misging en gaat door. Daardoor
  # staan er in het logboek regels die een gebruiker nooit te zien krijgt maar
  # wel verklaren waarom het "niet lijkt te werken". Die vertalen we hier.
  $recent = @($regels | Select-Object -Last 25) -join "`n"
  if ($recent -match 'naar voren halen mislukt') {
    Waarschuw 'de map gaat wel open, maar blijft achter de browser staan.'
    Info 'PowerShell mag op deze pc geen tijdelijke DLL bouwen (beveiligingsbeleid),'
    Info 'waardoor de handler het mapvenster niet naar voren kan halen. De map staat'
    Info 'er dus wél; kijk op de taakbalk. Gebruikers melden dit als "er gebeurt niets".'
  }
  if ($recent -match 'venster niet gevonden om naar voren te halen') {
    Waarschuw 'de handler vond het mapvenster niet terug om het naar voren te halen.'
    Info 'Meestal duurde het openen van een WebDAV-pad simpelweg te lang.'
  }
  if ($recent -match 'FOUT:') {
    Mis 'er staat een foutregel in het logboek; zie hierboven wat er misging.'
  }
} elseif (Test-Path -LiteralPath $logBestand) {
  Waarschuw 'het logboek is leeg: er is op dit account nog nooit een klik doorgekomen.'
} else {
  Waarschuw 'er is nog geen logboek: op dit account is de handler nog nooit gestart.'
}

# ------------------------------------------------------------------- 6. proef
if ($Proef) {
  Kop '6. Proef: zelf een eva://-adres afvuren'
  Info 'Er kan zo een mapvenster opengaan; dat mag je gewoon sluiten.'

  $voor = 0
  if (Test-Path -LiteralPath $logBestand) { $voor = (Get-Item -LiteralPath $logBestand).Length }

  $gestart = $false
  try { Start-Process $testUri; $gestart = $true }
  catch { Mis ('Windows wil dit adres niet openen: ' + $_.Exception.Message) }

  if ($gestart) {
    $gegroeid = $false
    foreach ($poging in 1..20) {
      Start-Sleep -Milliseconds 500
      if ((Test-Path -LiteralPath $logBestand) -and (Get-Item -LiteralPath $logBestand).Length -gt $voor) {
        $gegroeid = $true; break
      }
    }
    if ($gegroeid) {
      Goed 'het logboek is meegegroeid: de aanroep bereikt de handler.'
      foreach ($regel in (@(Get-Content -LiteralPath $logBestand) | Select-Object -Last 3)) { Info $regel }
    } else {
      Mis 'het logboek groeide niet; Windows heeft de handler niet gestart.'
    }
  }
}

# -------------------------------------------------------------------- uitslag
Kop 'Uitslag'
if ($fouten -eq 0 -and $waarschuwingen -eq 0) {
  Write-Host '  Alles in orde.' -ForegroundColor Green
} elseif ($fouten -eq 0) {
  Write-Host "  Werkt, met $waarschuwingen aandachtspunt(en) hierboven." -ForegroundColor Yellow
} else {
  Write-Host "  $fouten probleem(en) gevonden." -ForegroundColor Red
}

Write-Host ''
Write-Host 'Klopt alles hierboven maar doet de knop in EVA nog niets?'
Write-Host '  1. Sluit de browser volledig af (taskkill /IM chrome.exe /F) en open hem opnieuw.'
Write-Host '  2. Klik in EVA op "Open in Verkenner" en draai dit script daarna nog een keer.'
Write-Host '     Geen nieuwe regel in het logboek = de aanroep strandt vóór de pc. Werkt stap 6'
Write-Host '     (-Proef) wél, dan ligt het aan de browser: de endpointbeveiliging houdt tegen'
Write-Host '     dat een browser powershell.exe start. Daar is een uitzondering voor nodig.'
Write-Host '     Wel een nieuwe regel maar geen venster = het pad klopt niet; zie stap 4.'

if ($fouten -gt 0) { exit 1 }
exit 0
