'use client'

import React from 'react'
import toast from 'react-hot-toast'
import type { RechtenDocument } from '@everts/database/platform-types'
import { leesRechtenDocument } from '@everts/database/rechten'
import { updateAfdelingRechtenDocument } from './actions'
import { Card, EmptyState } from '@/components/ui'
import KanaalRechtenEditor from '@/components/rechten/KanaalRechtenEditor'

export type AfdelingMetRechten = {
  id: string
  naam: string
  rechten: unknown
  standaard_rechten: unknown
}

function AfdelingKaart({ afdeling }: { afdeling: AfdelingMetRechten }) {
  // `leesRechtenDocument` valt terug op de platte spiegel zolang de v2-kolom leeg
  // is, zodat een nieuwe afdeling meteen werkt zonder migratie.
  const doc = leesRechtenDocument(afdeling.rechten, afdeling.standaard_rechten)

  async function opslaan(nieuw: RechtenDocument) {
    const res = await updateAfdelingRechtenDocument(afdeling.id, nieuw)
    if (!res.ok) { toast.error(res.error); throw new Error(res.error) }
    toast.success(`Rechten opgeslagen voor ${afdeling.naam}`)
  }

  return (
    <Card style={{ padding: '16px 20px', marginBottom: 10 }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
        color: 'var(--fg)', marginBottom: 12,
      }}>
        {afdeling.naam}
      </div>
      <KanaalRechtenEditor waarde={doc} opslaan={opslaan} />
    </Card>
  )
}

export default function AfdelingRechtenBeheer({ afdelingen }: { afdelingen: AfdelingMetRechten[] }) {
  if (afdelingen.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Geen actieve afdelingen gevonden"
          description={
            <>
              Maak eerst afdelingen aan via{' '}
              <a href="/instellingen/medewerkers?deel=functies" style={{ color: 'var(--accent)' }}>
                Instellingen → Medewerkers
              </a>.
            </>
          }
        />
      </Card>
    )
  }

  return <div>{afdelingen.map(a => <AfdelingKaart key={a.id} afdeling={a} />)}</div>
}
