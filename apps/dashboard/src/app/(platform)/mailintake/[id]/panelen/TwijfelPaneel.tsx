'use client'

/**
 * Waar EVA over twijfelt — en waar je het meteen kunt rechtzetten.
 *
 * Dit paneel staat links, op de plek waar eerder de mail stond. Dat is bewust: de
 * mail zelf lees je één keer, maar de velden waar EVA onzeker over is zijn precies
 * waar de behandelaar zijn tijd aan kwijt is. Die horen dus vooraan.
 *
 * Bovenaan staat de zekerheid groot. Niet als versiering: het is het enige getal
 * dat in één oogopslag zegt of dit bericht twee minuten of een half uur kost.
 *
 * De velden hier zijn dezelfde velden als in het formulier ernaast — ze delen de
 * toestand van het behandelscherm. Wat je hier wijzigt, staat daar ook meteen. Twee
 * plekken met dezelfde waarde die uit elkaar kunnen lopen zou erger zijn dan geen
 * tweede plek.
 */

import React from 'react'

import { Card } from '@/components/ui'
import { VELD_BETROUWBAAR } from '@/lib/mailintake/types'

import { klein, veldStijl } from './velden'

export interface TwijfelVeld {
  sleutel: string
  label: string
  score: number
  /** De invoer zelf; het behandelscherm levert hem aan zodat de waarde gedeeld blijft. */
  invoer: React.ReactNode
  /** Waarom EVA hier niet zeker van is, in gewone taal. */
  reden?: string | null
}

/** Kleur bij een score: groen boven de drempel, geel eronder, rood bij vrijwel niets. */
function tint(score: number): { bg: string; fg: string } {
  if (score >= VELD_BETROUWBAAR) return { bg: 'var(--su-100, #dcfce7)', fg: 'var(--su-800, #166534)' }
  if (score >= 0.5) return { bg: 'var(--wa-100, #fef3c7)', fg: 'var(--wa-800, #92400e)' }
  return { bg: 'var(--da-100, #fee2e2)', fg: 'var(--da-800, #991b1b)' }
}

export default function TwijfelPaneel({
  zekerheid, soortLabel, soortVertrouwen, velden, redenVoorleggen,
}: {
  /** De zekerheid over het geheel, 0 tot 1. */
  zekerheid: number
  soortLabel: string
  soortVertrouwen: number | null
  /** De velden die aandacht vragen, meest onzekere eerst. */
  velden: TwijfelVeld[]
  redenVoorleggen?: string | null
}) {
  const pct = Math.round(zekerheid * 100)
  const kleur = tint(zekerheid)

  return (
    <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── De zekerheid, groot ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          fontSize: 40, fontWeight: 700, lineHeight: 1,
          padding: '4px 12px', borderRadius: 10,
          background: kleur.bg, color: kleur.fg,
        }}>
          {pct}%
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>zeker van dit voorstel</span>
          <span style={klein}>
            {soortLabel}
            {soortVertrouwen != null ? ` · ${Math.round(soortVertrouwen * 100)}%` : ''}
          </span>
        </div>
      </div>

      {redenVoorleggen && (
        <p style={{ ...klein, margin: 0 }}>{redenVoorleggen}</p>
      )}

      {/* ── De velden die aandacht vragen ── */}
      {velden.length === 0 ? (
        <p style={{ ...klein, margin: 0 }}>
          EVA is van alle velden voldoende zeker. Loop het voorstel hiernaast na en maak het dossier aan.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Controleer dit {velden.length === 1 ? 'veld' : `${velden.length} velden`}
          </div>
          {velden.map(v => {
            const t = tint(v.score)
            return (
              <label key={v.sleutel} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ ...klein, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {v.label}
                  <span style={{
                    fontSize: 11, padding: '1px 5px', borderRadius: 4,
                    background: t.bg, color: t.fg,
                  }}>
                    {Math.round(v.score * 100)}%
                  </span>
                </span>
                {v.invoer}
                {v.reden && <span style={klein}>{v.reden}</span>}
              </label>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/** Gedeelde opmaak voor de invoervelden die het behandelscherm hier inhangt. */
export { veldStijl }

/**
 * Stelt de lijst met twijfelvelden samen.
 *
 * Staat hier en niet in het behandelscherm omdat het over dit paneel gaat, en
 * omdat dat scherm anders opnieuw boven de achthonderd regels uitkomt. De invoer
 * deelt de toestand van het formulier ernaast: wat je hier wijzigt staat daar ook
 * meteen, want twee plekken met dezelfde waarde die uit elkaar kunnen lopen zou
 * erger zijn dan geen tweede plek.
 *
 * Alles onder de betrouwbaarheidsdrempel komt hier terecht, plus wat leeg is
 * gebleven terwijl het dossier het nodig heeft. Meest onzekere bovenaan.
 */
export function bouwTwijfelVelden(a: {
  zekerheid: Record<string, number>
  bewerkbaar: boolean
  categorieen: { id: number; name: string }[]
  werkmaatschappijen: { id: string; naam: string }[]
  klantId: string | null
  klantNaam: string
  setKlantNaam: (v: string) => void
  setKlantZoek: (v: string) => void
  omschrijving: string
  setOmschrijving: (v: string) => void
  straat: string
  setStraat: (v: string) => void
  huisnummer: string
  setHuisnummer: (v: string) => void
  adresBevestigd: boolean
  categorieId: number | ''
  setCategorieId: (v: number | '') => void
  werkmaatschappijId: string
  setWerkmaatschappijId: (v: string) => void
}): TwijfelVeld[] {
  const uit: TwijfelVeld[] = []
  const onzeker = (sleutel: string) => (a.zekerheid[sleutel] ?? 0) < VELD_BETROUWBAAR

  if (!a.klantId || onzeker('klant_naam')) {
    uit.push({
      sleutel: 'klant', label: 'Opdrachtgever', score: a.zekerheid.klant_naam ?? 0,
      reden: a.klantId ? null : 'Nog geen bestaande relatie gekozen.',
      invoer: (
        <input
          style={veldStijl} value={a.klantNaam} disabled={!a.bewerkbaar}
          onChange={e => { a.setKlantNaam(e.target.value); a.setKlantZoek(e.target.value) }}
          placeholder="Zoek de opdrachtgever…"
        />
      ),
    })
  }

  if (onzeker('omschrijving')) {
    uit.push({
      sleutel: 'omschrijving', label: 'Omschrijving van het werk',
      score: a.zekerheid.omschrijving ?? 0,
      invoer: (
        <input
          style={veldStijl} value={a.omschrijving} disabled={!a.bewerkbaar}
          onChange={e => a.setOmschrijving(e.target.value)}
        />
      ),
    })
  }

  if (!a.adresBevestigd || onzeker('werkadres_straat')) {
    uit.push({
      sleutel: 'adres', label: 'Werkadres',
      score: a.adresBevestigd ? 1 : (a.zekerheid.werkadres_straat ?? 0),
      reden: a.adresBevestigd ? null : 'Niet door PDOK bevestigd.',
      invoer: (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
          <input style={veldStijl} value={a.straat} disabled={!a.bewerkbaar}
            onChange={e => a.setStraat(e.target.value)} placeholder="Straat" />
          <input style={veldStijl} value={a.huisnummer} disabled={!a.bewerkbaar}
            onChange={e => a.setHuisnummer(e.target.value)} placeholder="Nr." />
        </div>
      ),
    })
  }

  if (a.categorieId === '' || onzeker('categorie_voorstel')) {
    uit.push({
      sleutel: 'categorie', label: 'Categorie', score: a.zekerheid.categorie_voorstel ?? 0,
      invoer: (
        <select style={veldStijl} value={a.categorieId} disabled={!a.bewerkbaar}
          onChange={e => a.setCategorieId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">— kies —</option>
          {a.categorieen.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ),
    })
  }

  // Leeg betekent hier: de categorie besliste niet en het werk is gemengd of
  // onduidelijk. Dat is precies de vraag die aan een mens hoort.
  if (!a.werkmaatschappijId) {
    uit.push({
      sleutel: 'werkmaatschappij', label: 'Werkmaatschappij', score: 0,
      reden: 'Het werk is gemengd of onduidelijk; kies zelf.',
      invoer: (
        <select style={veldStijl} value={a.werkmaatschappijId} disabled={!a.bewerkbaar}
          onChange={e => a.setWerkmaatschappijId(e.target.value)}>
          <option value="">— kies —</option>
          {a.werkmaatschappijen.map(w => <option key={w.id} value={w.id}>{w.naam}</option>)}
        </select>
      ),
    })
  }

  return uit.sort((x, y) => x.score - y.score)
}
