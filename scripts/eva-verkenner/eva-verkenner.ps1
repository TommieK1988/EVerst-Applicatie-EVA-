<#
.SYNOPSIS
  Protocol-handler voor `eva://map?url=<SharePoint-map-URL>` — opent die map in Verkenner.

.DESCRIPTION
  EVA draait in de browser en mag daar geen Verkenner openen. Deze handler vangt
  een klik op "Open in Verkenner" op en zoekt zelf het juiste pad:

    1. Is de bibliotheek met OneDrive gesynchroniseerd? Dan het lokale pad
       (snel, werkt offline). De koppeling SharePoint-URL → lokale map komt uit
       het OneDrive-register, dus er hoeft niets per pc ingesteld te worden.
    2. Anders het WebDAV-netwerkpad (\\tenant.sharepoint.com@SSL\DavWWWRoot\...).
       Werkt zonder sync, maar kan om een login vragen en is trager.

  Wordt aangeroepen als:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden
                   -File eva-verkenner.ps1 -Uri "%1"

  `-File` is bewust: daarmee is de meegegeven URI altijd data en nooit code.
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Uri,

  # Toont alleen welk pad gekozen zou worden, zonder Verkenner te openen.
  # Handig om te controleren of de sync-herkenning op een pc klopt.
  [switch]$Controleer
)

# Alleen mappen op deze SharePoint-hosts worden geopend. Een eva://-link van een
# willekeurige website kan zo nooit een ander netwerkpad laten openen.
$ToegestaneHosts = @(
  'evertsgroep.sharepoint.com',
  'evertsgroep-my.sharepoint.com'
)

function Toon-Fout([string]$Tekst) {
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    [System.Windows.Forms.MessageBox]::Show(
      $Tekst, 'EVA — map openen',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
  } catch {
    Write-Error $Tekst
  }
}

function Get-Doel([string]$RuweUri) {
  if ([string]::IsNullOrWhiteSpace($RuweUri)) { throw 'Geen adres meegekregen.' }

  $parsed = $null
  if (-not [System.Uri]::TryCreate($RuweUri, [System.UriKind]::Absolute, [ref]$parsed)) {
    throw "Onbegrijpelijk adres: $RuweUri"
  }
  if ($parsed.Scheme -ne 'eva') { throw "Alleen eva://-adressen worden geopend, niet '$($parsed.Scheme)'." }
  if ($parsed.Host -ne 'map')   { throw "Onbekende eva-actie '$($parsed.Host)'." }

  $query = [System.Web.HttpUtility]::ParseQueryString($parsed.Query)
  $url = $query['url']
  if ([string]::IsNullOrWhiteSpace($url)) { throw 'Het adres bevat geen map-URL.' }

  $doel = $null
  if (-not [System.Uri]::TryCreate($url, [System.UriKind]::Absolute, [ref]$doel)) {
    throw "Onbegrijpelijke map-URL: $url"
  }
  if ($doel.Scheme -ne 'https') { throw 'De map-URL moet https zijn.' }
  if ($ToegestaneHosts -notcontains $doel.Host.ToLowerInvariant()) {
    throw "Deze SharePoint-omgeving staat niet in de lijst met toegestane hosts: $($doel.Host)"
  }
  return [pscustomobject]@{ Uri = $doel; Ruw = $url }
}

<# Server-relatieve mapsegmenten, gedecodeerd: /sites/X/Shared%20Documents/Y → @('sites','X','Shared Documents','Y') #>
function Get-Segmenten([System.Uri]$Doel, [string]$RuweUrl) {
  # Niet $Doel.AbsolutePath gebruiken: System.Uri ziet alles na een letterlijke
  # '#' als fragment, terwijl een mapnaam dat teken gewoon mag bevatten
  # ("Jansen & Zn #2"). Het pad zou dan stil afgekapt worden. Een '?' hoort wél
  # bij een query — dat teken kan in een mapnaam niet voorkomen.
  $pad = $RuweUrl.Substring($Doel.GetLeftPart([System.UriPartial]::Authority).Length)
  $vraagteken = $pad.IndexOf('?')
  if ($vraagteken -ge 0) { $pad = $pad.Substring(0, $vraagteken) }

  # Eerst splitsen, dan pas decoderen: anders zou een %2F of %5C in een naam
  # alsnog als mapscheiding gaan werken.
  $segmenten = @(
    $pad.Split('/', [System.StringSplitOptions]::RemoveEmptyEntries) |
      ForEach-Object { [System.Uri]::UnescapeDataString($_) }
  )
  foreach ($s in $segmenten) {
    # Padtrucs weren; ':' vangt ook een verkapte stationsaanduiding af.
    if ($s -eq '..' -or $s -eq '.' -or $s.Contains(':') -or $s.Contains('\')) {
      throw "Ongeldig mappad: $pad"
    }
  }
  if ($segmenten.Count -eq 0) { throw 'De map-URL wijst niet naar een map.' }
  return $segmenten
}

<# Alle met OneDrive gesynchroniseerde bibliotheken van deze gebruiker. #>
function Get-SyncMappen {
  $sleutel = 'HKCU:\Software\SyncEngines\Providers\OneDrive'
  if (-not (Test-Path $sleutel)) { return @() }

  $mappen = foreach ($item in Get-ChildItem $sleutel -ErrorAction SilentlyContinue) {
    $p = Get-ItemProperty $item.PSPath -ErrorAction SilentlyContinue
    if (-not $p -or -not $p.MountPoint) { continue }
    # FullRemotePath is het nauwkeurigst (inclusief submap); UrlNamespace is de
    # bibliotheek-root en staat er altijd.
    $remote = if ($p.FullRemotePath) { $p.FullRemotePath } else { $p.UrlNamespace }
    if (-not $remote) { continue }
    [pscustomobject]@{
      Mount  = $p.MountPoint.TrimEnd('\')
      Remote = $remote.TrimEnd('/')
      Exact  = [bool]$p.FullRemotePath
    }
  }
  # Langste (= meest specifieke) remote-pad eerst.
  return @($mappen | Sort-Object { $_.Remote.Length } -Descending)
}

<# Lokaal pad van de map, of $null als de bibliotheek niet gesynchroniseerd is. #>
function Get-LokaalPad([System.Uri]$Doel, [string[]]$Segmenten) {
  $volledig = ($Doel.GetLeftPart([System.UriPartial]::Authority) + '/' + ($Segmenten -join '/'))

  foreach ($map in Get-SyncMappen) {
    $remote = [System.Uri]::UnescapeDataString($map.Remote)
    if (-not $volledig.StartsWith($remote, [System.StringComparison]::OrdinalIgnoreCase)) { continue }

    $rest = $volledig.Substring($remote.Length).Trim('/')
    $restSegmenten = @($rest.Split('/', [System.StringSplitOptions]::RemoveEmptyEntries))

    # Synchroniseert iemand één submap van een bibliotheek, dan registreert
    # OneDrive soms alleen de bibliotheek-root. De submapnaam staat dan achteraan
    # de naam van de sync-map ("De Rekenkamer - Calculaties") en zit dus al in
    # $map.Mount; anders zou hij dubbel in het pad belanden.
    #
    # Dit gaat bewust op naam en niet op "probeer een niveau hoger": twee mappen
    # met dezelfde naam op verschillende niveaus zouden anders verwisseld raken.
    $staart = $restSegmenten
    if (-not $map.Exact -and $staart.Count) {
      $mountNaam = Split-Path $map.Mount -Leaf
      $scheiding = $mountNaam.LastIndexOf(' - ')
      if ($scheiding -ge 0) {
        $submap = $mountNaam.Substring($scheiding + 3)
        if ([string]::Equals($staart[0], $submap, [System.StringComparison]::OrdinalIgnoreCase)) {
          $staart = @($staart | Select-Object -Skip 1)
        }
      }
    }

    $kandidaat = if ($staart.Count) { Join-Path $map.Mount ($staart -join '\') } else { $map.Mount }
    if (Test-Path -LiteralPath $kandidaat) { return $kandidaat }
  }
  return $null
}

<# Netwerkpad via WebDAV, voor wie de bibliotheek niet synchroniseert. #>
function Get-WebDavPad([System.Uri]$Doel, [string[]]$Segmenten) {
  return '\\' + $Doel.Host + '@SSL\DavWWWRoot\' + ($Segmenten -join '\')
}

try {
  Add-Type -AssemblyName System.Web -ErrorAction Stop

  $doelInfo = Get-Doel $Uri
  $doel = $doelInfo.Uri
  $segmenten = Get-Segmenten $doel $doelInfo.Ruw

  $pad = Get-LokaalPad $doel $segmenten
  $bron = if ($pad) { 'OneDrive (lokaal)' } else { 'WebDAV (netwerk)' }
  if (-not $pad) { $pad = Get-WebDavPad $doel $segmenten }

  if ($Controleer) {
    Write-Output "Bron: $bron"
    Write-Output "Pad:  $pad"
    return
  }

  Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$pad`""
} catch {
  if ($Controleer) { throw }
  Toon-Fout "De map kon niet in Verkenner geopend worden.`n`n$($_.Exception.Message)"
  exit 1
}
