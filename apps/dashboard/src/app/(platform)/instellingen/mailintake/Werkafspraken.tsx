'use client'

/**
 * De afspraken die EVA onthoudt over het lezen van de post.
 *
 * Hier staat wat er op het behandelscherm met "altijd zo doen" is vastgelegd, plus
 * wat je hier zelf toevoegt. Elke afspraak heeft het antwoord van EVA eronder: zo
 * zie je of een regel landt zoals je hem bedoelde, en niet pas bij de tiende mail
 * die verkeerd gelezen is.
 *
 * Uitzetten in plaats van weggooien is de normale handeling -- een afspraak die
 * tijdelijk niet geldt komt vaak terug. Archiveren verbergt hem, maar bewaart hem:
 * hij verklaart hoe de post in die periode gelezen is.
 */

import React from 'react'
import toast from 'react-hot-toast'

import { Button, Card } from '@/components/ui'
import {
  bewaarWerkafspraak, zetWerkafspraakActief, archiveerWerkafspraak,
} from '@/lib/mailintake/werkafspraak-actions'
import type { Werkafspraak } from '@/lib/mailintake/types'

const klein: React.CSSProperties = { fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.45 }
const veld: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)',
}

export default function Werkafspraken({
  afspraken, postbussen, magBeheren,
}: {
  afspraken: Werkafspraak[]
  postbussen: { id: string; naam: string }[]
  magBeheren: boolean
}) {
  const [tekst, setTekst] = React.useState('')
  const [postbusId, setPostbusId] = React.useState<string>('')
  const [bezig, setBezig] = React.useState(false)
  const [antwoord, setAntwoord] = React.useState<{ uitleg: string; volledig: boolean } | null>(null)

  const voegToe = async () => {
    setBezig(true)
    setAntwoord(null)
    try {
      const res = await bewaarWerkafspraak(tekst, postbusId || null)
      if (!res.ok) { toast.error(res.error ?? 'Niet gelukt'); return }
      if (res.uitleg) setAntwoord({ uitleg: res.uitleg, volledig: res.volledig !== false })
      setTekst('')
      toast.success('Afspraak vastgelegd')
    } finally {
      setBezig(false)
    }
  }

  const naamVan = (id: string | null) =>
    id == null ? 'Alle postbussen' : postbussen.find(p => p.id === id)?.naam ?? 'Onbekende postbus'

  return (
    <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Werkafspraken</h2>
        <span style={klein}>
          Wat EVA moet weten bij het lezen van binnenkomende post. Dit stuurt hoe hij leest —
          de categorieënlijst, de adrescontrole en de fase blijven doen wat ze doen.
        </span>
      </div>

      {magBeheren && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={tekst}
            onChange={e => setTekst(e.target.value)}
            disabled={bezig}
            rows={2}
            placeholder="Bijvoorbeeld: Kessler zet het bonnummer in de onderwerpregel, niet in de tekst."
            style={{ ...veld, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={postbusId}
              onChange={e => setPostbusId(e.target.value)}
              disabled={bezig}
              style={{ ...veld, width: 'auto' }}
            >
              <option value="">Alle postbussen</option>
              {postbussen.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
            </select>
            <Button onClick={() => void voegToe()} disabled={tekst.trim().length < 3 || bezig}>
              {bezig ? 'EVA denkt mee…' : 'Afspraak vastleggen'}
            </Button>
          </div>
          {antwoord && (
            <div
              className={antwoord.volledig
                ? 'rounded-md border border-success-300 px-2.5 py-2 text-[12.5px] leading-normal'
                : 'rounded-md border border-warning-300 bg-warning-50 px-2.5 py-2 text-[12.5px] leading-normal text-warning-700'}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>EVA</div>
              {antwoord.uitleg}
            </div>
          )}
        </div>
      )}

      {afspraken.length === 0 ? (
        <span style={klein}>
          Nog geen afspraken. Je kunt ze ook vastleggen vanaf een bericht, met de knop
          &ldquo;Altijd zo doen&rdquo;.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {afspraken.map(a => (
            <div
              key={a.id}
              style={{
                border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px',
                // Uit betekent: staat er nog, doet niets. Gedimd en niet verborgen,
                // zodat je ziet dát hij bestaat als je je afvraagt waarom iets niet
                // meer gebeurt.
                opacity: a.actief ? 1 : 0.5,
              }}
            >
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>{a.tekst}</div>
              {a.uitleg && (
                <div style={{ ...klein, marginTop: 4, fontStyle: 'italic' }}>EVA: {a.uitleg}</div>
              )}
              <div style={{ ...klein, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>{naamVan(a.postbusId)}</span>
                <span>{new Date(a.createdAt).toLocaleDateString('nl-NL')}</span>
                {magBeheren && (
                  <>
                    <button
                      type="button"
                      onClick={() => void zetWerkafspraakActief(a.id, !a.actief).then(() => location.reload())}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer', color: 'hsl(var(--primary))' }}
                    >
                      {a.actief ? 'Uitzetten' : 'Aanzetten'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm('Deze afspraak archiveren? Hij werkt dan niet meer mee.')) return
                        void archiveerWerkafspraak(a.id).then(() => location.reload())
                      }}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer', color: 'var(--fg-muted)' }}
                    >
                      Archiveren
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
