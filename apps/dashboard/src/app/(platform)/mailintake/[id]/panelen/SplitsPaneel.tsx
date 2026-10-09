'use client'

/**
 * Het splitspaneel: één bericht, meerdere dossiers op dezelfde opdrachtgever.
 *
 * Bovenaan het voorstel, want het verandert wat de knop Aanmaken doet. Drie
 * standen:
 *
 *  * **Uit, één adres** — één regel met de uitweg, voor de mail waarin EVA het
 *    tweede adres niet als losse klus herkende.
 *  * **Uit, maar EVA zag meerdere adressen** — een waarschuwing. Eén dossier is
 *    dan meestal fout, en precies zo raakte het tweede adres van Schep Vastgoed zoek.
 *  * **Aan** — welke dossiers er al zijn, welke adressen nog open staan, welke
 *    bijlagen met het volgende dossier meegaan, en de knop om af te ronden.
 *
 * De toestand zit in `gebruik-splitsen.ts`.
 */

import React from 'react'
import Link from 'next/link'

import { Badge, Button, Card } from '@/components/ui'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { adresRegel, type Splitsen } from './gebruik-splitsen'
import { kop, klein } from './velden'

const linkStijl: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'hsl(var(--primary))', textDecoration: 'underline', font: 'inherit',
}

export default function SplitsPaneel({ s, bewerkbaar, bezig }: {
  s: Splitsen
  bewerkbaar: boolean
  bezig: boolean
}) {
  if (!bewerkbaar) return null

  if (!s.aan) {
    if (s.meerdere) {
      return (
        <Alert
          tone="warning"
          title="Deze mail noemt meerdere werkadressen"
          actions={<Button size="sm" variant="outline" onClick={() => s.setAan(true)}>Per adres een dossier</Button>}
        >
          Eén dossier krijgt maar één werkadres; de rest komt dan alleen in de opmerkingen terecht.
        </Alert>
      )
    }
    return (
      <p style={klein}>
        Staan er meerdere klussen in deze mail?{' '}
        <button type="button" onClick={() => s.setAan(true)} style={linkStijl}>
          Maak er meerdere dossiers van
        </button>
      </p>
    )
  }

  return (
    <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ ...kop, marginBottom: 0 }}>Meerdere dossiers uit dit bericht</div>
        {s.delen.length === 0 && (
          <button type="button" onClick={() => s.setAan(false)} style={{ ...linkStijl, fontSize: 12 }}>
            Toch één dossier
          </button>
        )}
      </div>

      <p style={{ ...klein, margin: 0 }}>
        Opdrachtgever en contactpersoon blijven staan. Werkadres, omschrijving en bijlagen
        gelden per dossier: vul ze in, maak het dossier aan, en het volgende adres staat klaar.
        Elk dossier krijgt een eigen Bouw7-project.
      </p>

      {s.delen.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {s.delen.map(d => (
            <div key={d.dossierId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Badge tone="success" size="sm">Aangemaakt</Badge>
              <Link href={d.href} style={{ fontWeight: 600 }}>
                {d.dossiernummer ?? 'Dossier'}
              </Link>
              <span style={klein}>{d.werkadres}</span>
            </div>
          ))}
        </div>
      )}

      {s.open.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={klein}>Nog open in de mail</div>
          {s.open.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Badge tone="warning" variant="outline" size="sm">Open</Badge>
              <span>{adresRegel(a) || 'Adres onvolledig'}</span>
              <Button size="sm" variant="ghost" onClick={() => s.neemOver(a)} disabled={bezig}>
                Invullen
              </Button>
            </div>
          ))}
        </div>
      )}

      {s.kiesbaar.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={klein}>Bijlagen bij het volgende dossier (de mail zelf gaat altijd mee)</div>
          {s.kiesbaar.map(b => (
            <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <Checkbox checked={s.bijlageIds.has(b.id)} onCheckedChange={() => s.wisselBijlage(b.id)} />
              {b.bestandsnaam}
            </label>
          ))}
        </div>
      )}

      {s.delen.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => void s.afronden()} disabled={bezig || s.bezig} loading={s.bezig}>
            Klaar: bericht afhandelen
          </Button>
          <span style={klein}>Nog een adres? Vul het formulier en kies Aanmaken.</span>
        </div>
      )}
    </Card>
  )
}
