'use client'

/**
 * Voorvertoningspaneel naast de bestandenlijst: wat je in de lijst aanklikt, zie je
 * hier, zonder een tabblad te openen of iets te downloaden. Net als bij de foto's
 * hoeft een bestandsnaam dan niet te vertellen wat erin staat.
 *
 * Per type de beste weergave die er is:
 * - PDF en platte tekst: rechtstreeks uit de EVA-proxy, die ze `inline` uitlevert;
 * - Office-bestanden in SharePoint: de insluitbare voorvertoning van Graph;
 * - mail en markdown: dezelfde leesweergave als het leesvenster;
 * - de rest (o.a. Office-bestanden uit Bouw7, dat geen voorvertoning heeft): openen of downloaden.
 *
 * Bovenin kun je het bestand hernoemen. SharePoint wordt echt hernoemd; bij Bouw7
 * kan dat niet via de API en bewaart EVA een eigen naam.
 */

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, ExternalLink, FileText, Maximize2, Pencil } from 'lucide-react'
import { Button, Card, Input } from '@/components/ui'
import { bestandUrl, formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'
import { getSharePointVoorvertoning, hernoemDossierBestand } from '@/lib/dossiers/bestand-meta'
import { MailInhoud } from './MailVenster'
import { MarkdownInhoud } from './MarkdownVenster'

const INLINE_EXT = new Set(['pdf', 'txt', 'csv', 'log'])
const OFFICE_EXT = new Set(['doc', 'docx', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'vsd', 'vsdx', 'rtf', 'odt', 'ods'])

/** Hoogte van de inhoud: het paneel plakt naast de lijst en moet in één scherm passen. */
const INHOUD_HOOGTE = 'h-[calc(100vh-260px)] min-h-[360px]'

/** Naam zonder de extensie die er al achter staat; die blijft bij hernoemen vast. */
function zonderExtensie(naam: string, ext: string | null): string {
  if (!ext) return naam
  const staart = `.${ext.toLowerCase()}`
  return naam.toLowerCase().endsWith(staart) ? naam.slice(0, -staart.length) : naam
}

export type Hernoemd = { sleutel: string; bron: BestandRij['bron']; naam: string; webUrl?: string | null }

export default function BestandVoorvertoning({
  dossierId, rij, readOnly, onHernoemd, onVergroot,
}: {
  dossierId: string
  rij: BestandRij | null
  readOnly: boolean
  onHernoemd: (h: Hernoemd) => void
  /** Mail en markdown lezen prettiger in het grote leesvenster. */
  onVergroot?: (rij: BestandRij) => void
}) {
  if (!rij) {
    return (
      <Card className="grid place-items-center px-4 text-center">
        <div className={`${INHOUD_HOOGTE} grid place-items-center`}>
          <div className="space-y-2">
            <FileText className="mx-auto h-8 w-8 text-neutral-300" />
            <p className="text-[13px] text-neutral-500">Kies een bestand om het hier te bekijken.</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <Kop key={rij.sleutel} dossierId={dossierId} rij={rij} readOnly={readOnly} onHernoemd={onHernoemd} onVergroot={onVergroot} />
      <div className="border-t border-neutral-100 p-3">
        <Inhoud key={rij.sleutel} dossierId={dossierId} rij={rij} />
      </div>
    </Card>
  )
}

/* ─── Kop: naam, hernoemen, openen/downloaden ─────────────────────────────── */

function Kop({ dossierId, rij, readOnly, onHernoemd, onVergroot }: {
  dossierId: string
  rij: BestandRij
  readOnly: boolean
  onHernoemd: (h: Hernoemd) => void
  onVergroot?: (rij: BestandRij) => void
}) {
  const [bewerkt, setBewerkt] = useState(false)
  const [waarde, setWaarde] = useState('')
  const [bezig, setBezig] = useState(false)

  const ext = rij.extensie
  // Openen en downloaden staan hier en niet meer achter de naam: een klik in de lijst
  // is nu "bekijken".
  const openUrl = rij.openUrl ?? bestandUrl(rij)

  function begin() {
    setWaarde(zonderExtensie(rij.naam, ext))
    setBewerkt(true)
  }

  async function opslaan() {
    const nieuw = waarde.trim()
    // Bij Bouw7 mag leeg: dan geldt de naam uit Bouw7 weer.
    if (!nieuw && rij.bron === 'SharePoint') return
    if (nieuw === zonderExtensie(rij.naam, ext)) { setBewerkt(false); return }

    setBezig(true)
    const q = new URLSearchParams(rij.bronQuery)
    const res = await hernoemDossierBestand(dossierId, {
      sleutel: rij.sleutel,
      bron: rij.bron,
      driveId: q.get('driveId'),
      itemId: q.get('itemId'),
      extensie: ext,
    }, nieuw).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
    setBezig(false)

    if (!res.ok) { toast.error(res.error); return }
    setBewerkt(false)
    onHernoemd({ sleutel: rij.sleutel, bron: rij.bron, naam: res.naam, webUrl: res.webUrl })
    toast.success(rij.bron === 'SharePoint' ? 'Hernoemd in SharePoint.' : 'Naam aangepast in EVA.')
  }

  const meta = [
    rij.soortNaam,
    rij.bron,
    rij.datum,
    rij.grootte != null ? formatteerGrootte(rij.grootte) : null,
    rij.door,
  ].filter(Boolean).join(' · ')

  return (
    <div className="px-3 py-3">
      {bewerkt ? (
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Input
              inputSize="sm"
              autoFocus
              value={waarde}
              disabled={bezig}
              onChange={e => setWaarde(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void opslaan()
                if (e.key === 'Escape') setBewerkt(false)
              }}
              placeholder={rij.bron === 'Bouw7' ? 'Leeg = naam uit Bouw7' : 'Bestandsnaam'}
              aria-label="Nieuwe bestandsnaam"
            />
            {ext && <span className="shrink-0 text-[12px] text-neutral-400">.{ext}</span>}
          </div>
          <Button size="sm" onClick={() => void opslaan()} loading={bezig}>Opslaan</Button>
          <Button size="sm" variant="ghost" onClick={() => setBewerkt(false)} disabled={bezig}>Annuleer</Button>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p
              className="break-words text-[13px] font-semibold text-neutral-900"
              title={rij.oorspronkelijkeNaam ? `In Bouw7: ${rij.oorspronkelijkeNaam}` : undefined}
            >
              {rij.naam}
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">{meta}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!readOnly && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={begin}
                title={rij.bron === 'SharePoint' ? 'Hernoemen (ook in SharePoint)' : 'Naam in EVA aanpassen (Bouw7 blijft ongewijzigd)'}
                aria-label="Hernoemen"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onVergroot && (rij.soort === 'mail' || rij.soort === 'markdown') && (
              <Button size="icon-sm" variant="ghost" onClick={() => onVergroot(rij)} title="Groot lezen" aria-label="Groot lezen">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" asChild title="Openen in een nieuw tabblad">
              <a href={openUrl} target="_blank" rel="noopener noreferrer" aria-label="Openen">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button size="icon-sm" variant="ghost" asChild title="Downloaden">
              <a href={bestandUrl(rij, { download: true })} aria-label="Downloaden">
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      )}
      {rij.omschrijving && !bewerkt && (
        <p className="mt-1 text-[11px] text-neutral-400">{rij.omschrijving}</p>
      )}
    </div>
  )
}

/* ─── Inhoud ───────────────────────────────────────────────────────────────── */

function Inhoud({ dossierId, rij }: { dossierId: string; rij: BestandRij }) {
  const ext = (rij.extensie ?? '').toLowerCase()

  if (rij.soort === 'mail') return <MailInhoud rij={rij} iframeKlasse="h-[calc(100vh-420px)] min-h-[280px]" />
  if (rij.soort === 'markdown') return <MarkdownInhoud rij={rij} iframeKlasse={INHOUD_HOOGTE} />

  if (INLINE_EXT.has(ext)) {
    return (
      <iframe
        title={`Voorvertoning van ${rij.naam}`}
        src={bestandUrl(rij)}
        className={`${INHOUD_HOOGTE} w-full rounded-md border border-neutral-200 bg-white`}
      />
    )
  }

  if (rij.bron === 'SharePoint' && OFFICE_EXT.has(ext)) {
    return <SharePointOffice dossierId={dossierId} rij={rij} />
  }

  return <GeenVoorvertoning rij={rij} />
}

/**
 * Graph geeft een kortlevende, insluitbare link (Word/Excel/PowerPoint online in
 * leesmodus). Lukt dat niet, dan de afbeelding van de eerste pagina die SharePoint al
 * meelevert, en anders de knoppen.
 */
function SharePointOffice({ dossierId, rij }: { dossierId: string; rij: BestandRij }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let afgebroken = false
    const q = new URLSearchParams(rij.bronQuery)
    const driveId = q.get('driveId')
    const itemId = q.get('itemId')
    if (!driveId || !itemId) { setUrl(null); return }
    getSharePointVoorvertoning(dossierId, driveId, itemId)
      .then(u => { if (!afgebroken) setUrl(u) })
      .catch(() => { if (!afgebroken) setUrl(null) })
    return () => { afgebroken = true }
  }, [dossierId, rij.bronQuery])

  if (url === undefined) {
    return (
      <div className={`${INHOUD_HOOGTE} grid place-items-center rounded-md bg-neutral-50 text-[12px] text-neutral-400`}>
        Voorvertoning laden…
      </div>
    )
  }
  if (url) {
    return (
      <iframe
        title={`Voorvertoning van ${rij.naam}`}
        src={url}
        className={`${INHOUD_HOOGTE} w-full rounded-md border border-neutral-200 bg-white`}
      />
    )
  }
  if (rij.previewUrl) {
    return (
      <div className={`${INHOUD_HOOGTE} overflow-auto rounded-md border border-neutral-200 bg-neutral-50`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rij.previewUrl} alt={rij.naam} className="mx-auto max-w-full" />
      </div>
    )
  }
  return <GeenVoorvertoning rij={rij} />
}

function GeenVoorvertoning({ rij }: { rij: BestandRij }) {
  return (
    <div className={`${INHOUD_HOOGTE} grid place-items-center rounded-md bg-neutral-50 px-4 text-center`}>
      <div className="space-y-3">
        <FileText className="mx-auto h-8 w-8 text-neutral-300" />
        <p className="text-[12.5px] text-neutral-500">
          Voor dit bestandstype is geen voorvertoning
          {rij.bron === 'Bouw7' ? ' — Bouw7 levert die niet' : ''}.
        </p>
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href={rij.openUrl ?? bestandUrl(rij)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Openen
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={bestandUrl(rij, { download: true })}>
              <Download className="h-3.5 w-3.5" /> Downloaden
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
