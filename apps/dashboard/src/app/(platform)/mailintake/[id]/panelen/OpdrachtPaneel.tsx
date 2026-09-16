'use client'

/**
 * Het paneel voor een binnengekomen opdracht.
 *
 * Een opdracht maakt geen nieuw dossier: hij zet een offerte die wij hebben
 * uitgebracht op gewonnen, waarna het dossier naar de opdrachtfase promoveert.
 * Dat is onomkeerbaar en het raakt Bouw7, dus dit scherm doet twee dingen die de
 * aanvraagkant niet doet: het dwingt een expliciete keuze van het dossier af, en
 * het zegt vóóraf letterlijk wat er gaat gebeuren.
 *
 * Er wordt bewust niets voorgevuld bij meerdere kandidaten. Er staan honderden
 * dossiers in de offertefase; de verkeerde aanvinken kost een dossier in de
 * verkeerde fase, een verschoven Bouw7-projectstatus en een vertrokken aanneemsom.
 */

import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { Button, Card, useDialogen } from '@/components/ui'
import {
  bevestigOpdrachtOpDossier, toetsOfferteVoorOpdracht,
  getFactuuradressenVoorIntake, bewaarFactuuradresVoorIntake,
} from '@/lib/mailintake/actions'
import { zoekDossiers } from '@/lib/dossiers/actions'
import { DUPLICAAT_HARD } from '@/lib/mailintake/types'

const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const
const kop = { fontSize: 13, fontWeight: 600, marginBottom: 6 } as const

const veldStijl: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 6, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)',
}

export interface OfferteKandidaat {
  dossierId: string
  dossiernummer: string | null
  titel: string | null
  klantnaam: string | null
  hoofdstatus: string | null
  score: number
  redenen: string[]
  soort: string
}

type Factuuradres = {
  id: string
  label: string
  straat: string | null
  postcode: string | null
  plaats: string | null
}

export default function OpdrachtPaneel({
  berichtId, kandidaten, relatieId, bewerkbaar,
  voorstel, onKlaar,
}: {
  berichtId: string
  kandidaten: OfferteKandidaat[]
  /** De herkende opdrachtgever; nodig om factuuradressen op te halen. */
  relatieId: string | null
  bewerkbaar: boolean
  voorstel: {
    opdrachtReferentie: string | null
    opdrachtdatum: string | null
    klantOpmerkingen: string | null
  }
  onKlaar: (dossierId: string) => void
}) {
  const { bevestig, meld } = useDialogen()

  const offertes = kandidaten.filter(k => k.soort === 'offerte_match')
  const harde = offertes.filter(k => k.score >= DUPLICAAT_HARD)
  // Alleen voorselecteren als er niets te kiezen valt.
  const [dossierId, setDossierId] = useState<string | null>(
    harde.length === 1 ? harde[0].dossierId : null,
  )

  const [zoek, setZoek] = useState('')
  const [gevonden, setGevonden] = useState<{ id: string; titel: string; klant_naam: string | null }[]>([])
  const [extra, setExtra] = useState<OfferteKandidaat[]>([])

  const [referentie, setReferentie] = useState(voorstel.opdrachtReferentie ?? '')
  const [datum, setDatum] = useState(voorstel.opdrachtdatum ?? '')
  const [opmerking, setOpmerking] = useState(voorstel.klantOpmerkingen ?? '')

  const [adressen, setAdressen] = useState<Factuuradres[] | null>(null)
  const [adresKeuze, setAdresKeuze] = useState<'offerte' | 'bestaand' | 'nieuw'>('offerte')
  const [adresId, setAdresId] = useState<string>('')
  const [nieuwAdres, setNieuwAdres] = useState({ label: '', straat: '', postcode: '', plaats: '' })

  const [bezig, setBezig] = useState(false)
  const [waarschuwing, setWaarschuwing] = useState<string | null>(null)

  const alleKandidaten = [...offertes, ...extra]
  const gekozen = alleKandidaten.find(k => k.dossierId === dossierId) ?? null

  // Het gekozen dossier moet in de offertefase staan; anders valt er niets te winnen.
  React.useEffect(() => {
    let weg = false
    setWaarschuwing(null)
    if (!dossierId) return
    void toetsOfferteVoorOpdracht(dossierId).then(res => {
      if (!weg && !res.ok) setWaarschuwing(res.error)
    })
    return () => { weg = true }
  }, [dossierId])

  // Factuuradressen van de opdrachtgever, pas ophalen als het paneel er is.
  React.useEffect(() => {
    if (!relatieId) { setAdressen([]); return }
    void getFactuuradressenVoorIntake(relatieId).then(setAdressen)
  }, [relatieId])

  async function zoeken() {
    const term = zoek.trim()
    if (term.length < 2) return
    const res = await zoekDossiers(term, 10)
    setGevonden(res)
  }

  function kiesGevonden(d: { id: string; titel: string; klant_naam: string | null }) {
    setExtra(e => e.some(x => x.dossierId === d.id) ? e : [...e, {
      dossierId: d.id, dossiernummer: null, titel: d.titel,
      klantnaam: d.klant_naam, hoofdstatus: null, score: 0,
      redenen: ['Zelf opgezocht'], soort: 'offerte_match',
    }])
    setDossierId(d.id)
    setGevonden([])
    setZoek('')
  }

  async function bevestigen(forceer = false) {
    if (!dossierId) return

    if (!forceer) {
      const ok = await bevestig({
        titel: 'Offerte op gewonnen zetten',
        omschrijving:
          `Dit zet ${gekozen?.dossiernummer ?? 'het gekozen dossier'} op gewonnen en promoveert het naar de ` +
          'opdrachtfase. In Bouw7 gaat het project naar "02. Nieuwe opdracht", de werkbegroting wordt ' +
          'overgenomen als planningsbudget en de aanneemsom wordt weggeschreven. ' +
          'Waar mogelijk worden ook de verkooptermijnen aangemaakt.\n\nDoorgaan?',
        bevestigLabel: 'Op gewonnen zetten',
      })
      if (!ok) return
    }

    setBezig(true)
    try {
      let factuuradresId: string | null | undefined
      if (adresKeuze === 'bestaand' && adresId) {
        factuuradresId = adresId
      } else if (adresKeuze === 'nieuw' && relatieId && nieuwAdres.straat.trim()) {
        const res = await bewaarFactuuradresVoorIntake(relatieId, nieuwAdres)
        if (!res.ok) { toast.error(res.error ?? 'Factuuradres opslaan mislukt'); return }
        factuuradresId = res.id
      }

      const res = await bevestigOpdrachtOpDossier(berichtId, dossierId, {
        opdrachtReferentie: referentie.trim() || null,
        opdrachtdatum: datum || null,
        klantOpmerkingen: opmerking.trim() || null,
        factuuradresId,
        forceerBouw7: forceer,
      })

      if (!res.ok) {
        if (res.conflict) {
          const ok = await bevestig({
            titel: 'Bouw7 staat inmiddels anders',
            omschrijving:
              `In Bouw7 staat de offertestatus nu op "${res.conflict.bouw7Label}". ` +
              'Iemand anders heeft dat daar gewijzigd.\n\nToch op gewonnen zetten?',
            bevestigLabel: 'Toch doorzetten',
            destructief: true,
          })
          if (ok) await bevestigen(true)
          return
        }
        toast.error(res.error ?? 'Opdracht verwerken mislukt')
        return
      }

      toast.success(`${res.dossiernummer ?? 'Dossier'} staat op opdracht`)

      // Wat er ná de statuswissel niet lukte is geen mislukking van de opdracht,
      // maar het mag ook niet ongezien blijven: zonder termijnen kan er niet
      // gefactureerd worden.
      if (res.nazorg && res.nazorg.termijnen === 'mislukt') {
        await meld({
          titel: 'Verkooptermijnen nog niet aangemaakt',
          omschrijving:
            `De opdracht staat er, maar de termijnen niet: ${res.nazorg.termijnenReden ?? 'onbekende reden'}\n\n` +
            'Er staat een actie klaar om dit met de hand te doen.',
        })
      }
      onKlaar(dossierId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Opdracht verwerken mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={kop}>Bij welke offerte hoort deze opdracht?</div>
        {alleKandidaten.length === 0 && (
          <p style={klein}>
            EVA heeft geen offerte gevonden die hierbij past. Zoek het dossier hieronder op.
          </p>
        )}
        {harde.length > 1 && (
          <p style={{ ...klein, color: 'var(--wa-700, #b45309)' }}>
            Er passen meerdere offertes bij dit bericht. Kies zelf de juiste.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {alleKandidaten.map(k => (
            <label
              key={k.dossierId}
              style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', padding: 8, borderRadius: 6,
                border: `1px solid ${k.dossierId === dossierId ? 'var(--primary-border, #2b4a7d)' : 'var(--border)'}`,
                background: k.dossierId === dossierId ? 'var(--surface-2, #f6f8fb)' : 'transparent',
                cursor: bewerkbaar ? 'pointer' : 'default',
              }}
            >
              <input
                type="radio"
                name="offertedossier"
                checked={k.dossierId === dossierId}
                onChange={() => setDossierId(k.dossierId)}
                disabled={!bewerkbaar}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13 }}>
                <strong>{k.dossiernummer ?? 'zonder nummer'}</strong>
                {k.titel ? ` — ${k.titel}` : ''}
                {k.klantnaam ? <span style={klein}> · {k.klantnaam}</span> : null}
                {k.redenen.length > 0 && (
                  <span style={{ ...klein, display: 'block' }}>{k.redenen.join(' · ')}</span>
                )}
              </span>
            </label>
          ))}
        </div>

        {bewerkbaar && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              style={{ ...veldStijl, flex: 1 }}
              placeholder="Zoek een ander dossier op titel…"
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void zoeken() } }}
            />
            <Button variant="outline" onClick={() => void zoeken()}>Zoeken</Button>
          </div>
        )}
        {gevonden.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {gevonden.map(d => (
              <button
                key={d.id}
                onClick={() => kiesGevonden(d)}
                style={{
                  ...veldStijl, textAlign: 'left', cursor: 'pointer',
                }}
              >
                {d.titel}{d.klant_naam ? ` — ${d.klant_naam}` : ''}
              </button>
            ))}
          </div>
        )}

        {waarschuwing && (
          <p style={{ ...klein, color: 'var(--da-700, #b91c1c)', marginTop: 8 }}>{waarschuwing}</p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={klein}>Opdrachtreferentie</span>
          <input
            style={veldStijl} value={referentie} disabled={!bewerkbaar}
            onChange={e => setReferentie(e.target.value)}
            placeholder="Bon- of ordernummer van de klant"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={klein}>Opdrachtdatum</span>
          <input
            type="date" style={veldStijl} value={datum} disabled={!bewerkbaar}
            onChange={e => setDatum(e.target.value)}
          />
        </label>
      </div>

      <div>
        <div style={kop}>Factuuradres</div>
        <p style={klein}>
          De opdrachtgever blijft dezelfde; dit gaat alleen over het adres waar de factuur heen gaat.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {(['offerte', 'bestaand', 'nieuw'] as const).map(k => (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input
                type="radio" name="factuuradres" checked={adresKeuze === k}
                onChange={() => setAdresKeuze(k)} disabled={!bewerkbaar}
              />
              {k === 'offerte' && (
                <span>
                  Zoals op de offerte
                  {adressen != null && adressen.length === 0 && (
                    <span style={klein}> — er staat nog geen apart factuuradres bij deze klant</span>
                  )}
                </span>
              )}
              {k === 'bestaand' && <span>Een ander adres dat al bij deze klant staat</span>}
              {k === 'nieuw' && <span>Een nieuw factuuradres vastleggen</span>}
            </label>
          ))}
        </div>

        {adresKeuze === 'bestaand' && (
          <select
            style={{ ...veldStijl, marginTop: 6 }} value={adresId} disabled={!bewerkbaar}
            onChange={e => setAdresId(e.target.value)}
          >
            <option value="">— kies een adres —</option>
            {(adressen ?? []).map(a => (
              <option key={a.id} value={a.id}>
                {a.label} — {[a.straat, a.postcode, a.plaats].filter(Boolean).join(', ')}
              </option>
            ))}
          </select>
        )}

        {adresKeuze === 'nieuw' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginTop: 6 }}>
            {(['label', 'straat', 'postcode', 'plaats'] as const).map(veld => (
              <input
                key={veld}
                style={veldStijl}
                placeholder={veld[0].toUpperCase() + veld.slice(1)}
                value={nieuwAdres[veld]}
                disabled={!bewerkbaar}
                onChange={e => setNieuwAdres(a => ({ ...a, [veld]: e.target.value }))}
              />
            ))}
          </div>
        )}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={klein}>Opmerking van de klant (komt als notitie op het dossier)</span>
        <textarea
          style={{ ...veldStijl, minHeight: 70 }} value={opmerking} disabled={!bewerkbaar}
          onChange={e => setOpmerking(e.target.value)}
        />
      </label>

      {bewerkbaar && (
        <div>
          <Button onClick={() => void bevestigen()} disabled={!dossierId || bezig || waarschuwing != null}>
            {bezig ? 'Bezig…' : 'Offerte op gewonnen zetten'}
          </Button>
          {!dossierId && (
            <span style={{ ...klein, marginLeft: 8 }}>Kies eerst het dossier waar deze opdracht bij hoort.</span>
          )}
        </div>
      )}
    </Card>
  )
}
