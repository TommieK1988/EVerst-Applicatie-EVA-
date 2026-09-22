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

import { Button, Card } from '@/components/ui'
import { FASE_PLAATSINGEN, type DossierFase } from '@/components/dossiers/fase-plaatsing'
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

export interface AfhandelingProps {
  bewerkbaar: boolean
  bezig: boolean
  /** Alle verplichte velden zijn gevuld; anders staat de knop uit. */
  compleet: boolean
  /** Null als deze route geen dossier aanmaakt — een opdracht wint een offerte. */
  onAanmaken: (() => void) | null
  onGeenAanvraag: () => void
  onNegeren: () => void
  onOpnieuwLezen: () => void
  medewerkers: { id: string; naam: string }[]
  calculatorId: string
  setCalculatorId: (v: string) => void
  actie: { titel: string; medewerkerId: string; dagen: number }
  setActie: (v: { titel: string; medewerkerId: string; dagen: number }) => void
  /**
   * Waar dit dossier terechtkomt. Null op de opdrachtroute: daar wint een
   * bestaande offerte en bepaalt dat dossier zelf waar het staat.
   */
  fase: DossierFase | null
  setFase: (v: DossierFase) => void
  /**
   * Waarom een fase nu niet kan, per fase. Komt uit de proef -- servicedesk vraagt
   * een categorie uit die hoek, en omgekeerd hóórt die categorie daar.
   */
  faseBezwaar: Partial<Record<DossierFase, string>>
}

/**
 * De drie bestemmingen, als keuze.
 *
 * Bewust knoppen en geen select: het zijn er drie, ze sluiten elkaar uit, en wat
 * je kiest heeft gevolgen die je erbij wilt lezen. In een uitklaplijst zie je de
 * uitleg pas als je hem al hebt dichtgeklapt.
 */
function FaseKiezer({
  gekozen, kies, bezwaar, bewerkbaar,
}: {
  gekozen: DossierFase
  kies: (v: DossierFase) => void
  bezwaar: Partial<Record<DossierFase, string>>
  bewerkbaar: boolean
}) {
  const plaatsing = FASE_PLAATSINGEN[gekozen]
  return (
    <div style={{
      padding: '8px 9px', borderRadius: 6,
      background: 'var(--surface-2, var(--bg))', border: '1px solid var(--border)',
    }}>
      <div style={{ ...klein, marginBottom: 5 }}>Waar dit dossier terechtkomt</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
        {(Object.keys(FASE_PLAATSINGEN) as DossierFase[]).map(f => {
          const actief = f === gekozen
          const reden = bezwaar[f]
          return (
            <button
              key={f}
              type="button"
              onClick={() => kies(f)}
              disabled={!bewerkbaar}
              title={reden ?? FASE_PLAATSINGEN[f].uitleg}
              style={{
                flex: 1, padding: '5px 4px', borderRadius: 5, fontSize: 12.5,
                cursor: bewerkbaar ? 'pointer' : 'default',
                border: `1px solid ${actief ? 'hsl(var(--primary))' : 'var(--border)'}`,
                background: actief ? 'hsl(var(--primary))' : 'var(--bg)',
                color: actief ? 'hsl(var(--primary-foreground))' : 'var(--fg)',
                fontWeight: actief ? 600 : 400,
                // Een bezwaar zet de knop niet uit: de weg eruit is soms de
                // categorie wijzigen, en dan moet je wel kunnen zien welke kant je
                // op wilde. De blokkade zelf houdt het aanmaken tegen.
                opacity: reden && !actief ? 0.55 : 1,
              }}
            >
              {FASE_PLAATSINGEN[f].fase}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45 }}>
        Substatus <strong>{plaatsing.substatus}</strong>
        <span style={{ ...klein, display: 'block' }}>
          {plaatsing.uitleg} In Bouw7 op &ldquo;{plaatsing.bouw7Status}&rdquo;.
        </span>
      </div>
      {bezwaar[gekozen] && (
        <div style={{ ...klein, marginTop: 5, color: 'var(--warning-700, #92400e)' }}>
          {bezwaar[gekozen]}
        </div>
      )}
    </div>
  )
}

export default function TwijfelPaneel({
  zekerheid, soortLabel, soortVertrouwen, velden, redenVoorleggen, afhandeling,
}: {
  /** De zekerheid over het geheel, 0 tot 1. */
  zekerheid: number
  soortLabel: string
  soortVertrouwen: number | null
  /** De velden die aandacht vragen, meest onzekere eerst. */
  velden: TwijfelVeld[]
  redenVoorleggen?: string | null
  /**
   * Wat je met dit bericht kunt doen. Staat hier en niet bij het formulier, omdat
   * dit de kolom is waar je langsloopt: eerst nakijken wat onzeker is, dan wie het
   * oppakt, dan wegzetten.
   */
  afhandeling: AfhandelingProps
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

      {afhandeling.bewerkbaar && (
        <>
          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* ── Wie pakt het op ──
              De calculator vult EVA nooit zelf in: wie er calculeert volgt niet uit
              de mail, en afleiden uit wie de intake doet is een andere rol. */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={klein}>Calculator</span>
            <select
              style={veldStijl} value={afhandeling.calculatorId}
              onChange={e => afhandeling.setCalculatorId(e.target.value)}
            >
              <option value="">— nog niet toewijzen —</option>
              {afhandeling.medewerkers.map(m => (
                <option key={m.id} value={m.id}>{m.naam}</option>
              ))}
            </select>
          </label>

          {/* ── De eerste actie ──
              Vaak weet je bij het inlezen al wat er moet gebeuren -- opname
              inplannen, bestek opvragen. Dit is de goedkoopste plek om dat vast te
              leggen; hem later alsnog aanmaken kost een omweg langs het dossier. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={klein}>Actie op het nieuwe dossier</span>
            <input
              style={veldStijl}
              value={afhandeling.actie.titel}
              onChange={e => afhandeling.setActie({ ...afhandeling.actie, titel: e.target.value })}
              placeholder="Bijvoorbeeld: opname inplannen"
            />
            {afhandeling.actie.titel.trim() && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
                <select
                  style={veldStijl} value={afhandeling.actie.medewerkerId}
                  onChange={e => afhandeling.setActie({ ...afhandeling.actie, medewerkerId: e.target.value })}
                >
                  <option value="">— zelfde als de calculator —</option>
                  {afhandeling.medewerkers.map(m => (
                    <option key={m.id} value={m.id}>{m.naam}</option>
                  ))}
                </select>
                <select
                  style={veldStijl} value={afhandeling.actie.dagen}
                  onChange={e => afhandeling.setActie({ ...afhandeling.actie, dagen: Number(e.target.value) })}
                >
                  <option value={1}>morgen</option>
                  <option value={3}>3 dagen</option>
                  <option value={7}>een week</option>
                  <option value={14}>twee weken</option>
                </select>
              </div>
            )}
          </div>

          {/* ── Waar het heen gaat ──
              Stond eerst alleen in de bevestigingsdialoog, en dus pas in beeld
              nadat je had besloten -- en het stond vast op Aanvraag. Niet elke bon
              is een aanvraag: een opdracht zonder offerte vooraf hoort meteen in
              de opdrachtfase, en een onderhoudsbon op het servicedeskbord. Dat is
              hier te kiezen, met erbij wat het betekent. */}
          {afhandeling.fase && (
            <FaseKiezer
              gekozen={afhandeling.fase}
              kies={afhandeling.setFase}
              bezwaar={afhandeling.faseBezwaar}
              bewerkbaar={afhandeling.bewerkbaar && !afhandeling.bezig}
            />
          )}

          {/* ── Wegzetten ──
              Deze knoppen staan hier omdat dit de kolom is waar je langsloopt. Ze
              gelden voor elke route: ook een opdracht kan achteraf geen aanvraag
              blijken, en dan moet je hem ergens kwijt kunnen. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {afhandeling.onAanmaken && (
              <>
                <Button onClick={afhandeling.onAanmaken} disabled={!afhandeling.compleet || afhandeling.bezig}>
                  {afhandeling.bezig ? 'Bezig…' : 'Dossier aanmaken'}
                </Button>
                {!afhandeling.compleet && (
                  <span style={klein}>
                    Vul opdrachtgever, omschrijving, werkmaatschappij, categorie en het
                    volledige werkadres in.
                  </span>
                )}
              </>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button variant="outline" onClick={afhandeling.onGeenAanvraag} disabled={afhandeling.bezig}>
                Geen aanvraag
              </Button>
              <Button variant="outline" onClick={afhandeling.onNegeren} disabled={afhandeling.bezig}>
                Negeren
              </Button>
              <Button variant="ghost" onClick={afhandeling.onOpnieuwLezen} disabled={afhandeling.bezig}>
                Opnieuw laten lezen
              </Button>
            </div>
          </div>
        </>
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
  /** Adres aanvullen bij de adresservice; draait als je het veld verlaat. */
  controleerAdres: () => void
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
          {/* Ook hier de adresservice op blur: dit is de kolom waar je de
              onzekere velden bijwerkt, en dan hoort de postcode er vanzelf bij
              te komen in plaats van dat je hem in het formulier ernaast ophaalt. */}
          <input style={veldStijl} value={a.straat} disabled={!a.bewerkbaar}
            onChange={e => a.setStraat(e.target.value)} onBlur={a.controleerAdres} placeholder="Straat" />
          <input style={veldStijl} value={a.huisnummer} disabled={!a.bewerkbaar}
            onChange={e => a.setHuisnummer(e.target.value)} onBlur={a.controleerAdres} placeholder="Nr." />
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
