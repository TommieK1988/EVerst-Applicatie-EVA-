'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import type { GebruikerType, RechtenDocument, RechtenModule, Kanaal } from '@everts/database/platform-types'
import { leesRechtenDocument, mergeKanaal, modulesVoorKanaal } from '@everts/database/rechten'
import { updateGebruikerRechtenDocument } from './actions'
import { Card, Badge, Button, EmptyState } from '@/components/ui'
import KanaalRechtenEditor from '@/components/rechten/KanaalRechtenEditor'

/**
 * De gebruikerslijst met per persoon zijn persoonlijke afwijking op de afdeling.
 *
 * Eén uitklap per persoon en niet alles tegelijk open: de matrix is groot, en met
 * vijftien mensen tegelijk is het scherm onleesbaar.
 */

export type GebruikerRij = {
  id: string
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  email: string | null
  afdeling: string | null
  gebruiker_type: GebruikerType
  o365_email: string | null
  auth_user_id: string | null
  rechten: unknown
  rechten_override: unknown
  /** De rechten van zijn afdeling, als basis onder de afwijking. */
  afdeling_rechten: unknown
  afdeling_standaard_rechten: unknown
}

const TYPE_LABELS: Record<GebruikerType, string> = {
  geen: 'Geen', app_gebruiker: 'App', platform_gebruiker: 'Platform',
}
const TYPE_TONES: Record<GebruikerType, 'neutral' | 'info' | 'brand'> = {
  geen: 'neutral', app_gebruiker: 'info', platform_gebruiker: 'brand',
}

const kop: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
}

/** Hoeveel onderdelen wijken bij deze persoon af van zijn afdeling? */
function telAfwijkingen(doc: RechtenDocument): number {
  let n = 0
  for (const kanaal of ['desktop', 'mobiel'] as const) {
    n += Object.keys(doc[kanaal].modules).length + Object.keys(doc[kanaal].functies).length
  }
  return n
}

/** Waar iemand na samenvoegen op uitkomt, als korte samenvatting per kanaal. */
function samenvatting(doc: RechtenDocument, basis: RechtenDocument, kanaal: Kanaal): string {
  const set = mergeKanaal(basis[kanaal], doc[kanaal])
  const namen = modulesVoorKanaal(kanaal)
    .filter(m => set.modules[m.key as RechtenModule])
    .map(m => m.label)
  return namen.length ? namen.join(' · ') : 'geen onderdelen'
}

function GebruikerKaart({ g, eigenId }: { g: GebruikerRij; eigenId: string | null }) {
  const [open, setOpen] = useState(false)
  const basis = leesRechtenDocument(g.afdeling_rechten, g.afdeling_standaard_rechten)
  const doc = leesRechtenDocument(g.rechten, g.rechten_override)
  const naam = [g.voornaam, g.tussenvoegsel, g.achternaam].filter(Boolean).join(' ')
  const afwijkingen = telAfwijkingen(doc)
  const benJij = g.id === eigenId

  async function opslaan(nieuw: RechtenDocument) {
    const res = await updateGebruikerRechtenDocument(g.id, nieuw)
    if (!res.ok) { toast.error(res.error); throw new Error(res.error) }
    toast.success(`Rechten opgeslagen voor ${g.voornaam}`)
  }

  // Je kunt jezelf niet uit het beheer werken: dan komt niemand er meer bij deze
  // knoppen. Een andere beheerder kan het wel.
  function vergrendeld(module: RechtenModule): string | null {
    if (!benJij) return null
    if (module !== 'instellingen') return null
    return 'je eigen beheerrechten kun je niet wijzigen'
  }

  return (
    <Card id={g.id} style={{ padding: '14px 18px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href={`/medewerkers/${g.id}`} style={{
              fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600,
              color: 'var(--accent)', textDecoration: 'none',
            }}>
              {naam}
            </Link>
            <Badge tone={TYPE_TONES[g.gebruiker_type]} size="sm">{TYPE_LABELS[g.gebruiker_type]}</Badge>
            {benJij && <Badge tone="neutral" size="sm">jij</Badge>}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 2 }}>
            {g.afdeling ?? 'geen afdeling'}
            {g.email ? ` · ${g.email}` : ''}
            {' · '}{g.auth_user_id ? 'kan inloggen' : 'nog geen login'}
            {g.o365_email ? ' · Microsoft gekoppeld' : ''}
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--fg-muted)', textAlign: 'right', minWidth: 130 }}>
          {afwijkingen === 0
            ? 'volgt de afdeling'
            : `${afwijkingen} afwijking${afwijkingen === 1 ? '' : 'en'}`}
        </div>

        <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
          {open ? 'Sluiten' : 'Rechten'}
        </Button>
      </div>

      {!open && (
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)',
          marginTop: 8, lineHeight: 1.5,
        }}>
          <div><strong style={{ fontWeight: 600 }}>Desktop:</strong> {samenvatting(doc, basis, 'desktop')}</div>
          <div><strong style={{ fontWeight: 600 }}>Mobiel:</strong> {samenvatting(doc, basis, 'mobiel')}</div>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <KanaalRechtenEditor
            waarde={doc}
            basis={basis}
            opslaan={opslaan}
            vergrendeld={vergrendeld}
          />
        </div>
      )}
    </Card>
  )
}

export default function GebruikerRechtenBeheer({
  gebruikers, eigenId,
}: {
  gebruikers: GebruikerRij[]
  eigenId: string | null
}) {
  if (gebruikers.length === 0) {
    return (
      <Card>
        <EmptyState
          size="sm"
          title="Nog geen gebruikers ingesteld"
          description={
            <>Ga naar een <Link href="/medewerkers" style={{ color: 'var(--accent)' }}>medewerker</Link> om toegang toe te kennen.</>
          }
        />
      </Card>
    )
  }

  return (
    <div>
      <div style={{ ...kop, padding: '0 0 10px' }}>Gebruikers ({gebruikers.length})</div>
      {gebruikers.map(g => <GebruikerKaart key={g.id} g={g} eigenId={eigenId} />)}
    </div>
  )
}
