'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  opleverMomentStatusLabels,
  type OpleverHandtekeningRol, type OpleverToewijzingType,
} from '@everts/database'
import {
  maakOpleverpunt, maakToegangToken, voegHandtekeningToe,
  type OpleverMomentView, type OpleverToewijsbaar,
} from '@/lib/dossiers/oplevering'
import HandtekeningPad from '@/components/planning/werkbon/HandtekeningPad'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import PuntKaart from './PuntKaart'
import BottomSheet from './BottomSheet'
import { GROEN, GRIJS, RAND, TEKST, AMBER, ZACHT, VLAK, veld, label, primaireKnop, secundaireKnop } from './stijl'

/**
 * De oplevering lopen op de telefoon: punten aflopen, bewijs vastleggen, laten tekenen en delen.
 *
 * Bewust één scrollend scherm en geen wizard. Een oplevering is zelden lineair — je loopt terug
 * naar een punt, je slaat er een over, de opdrachtgever wijst er halverwege eentje aan. Een
 * stap-voor-stap-doorloop zou dat in de weg zitten.
 */
export default function OpleverDoorloop({ moment, dossierId, toewijsbaar, standaardNaam }: {
  moment: OpleverMomentView
  dossierId: string
  toewijsbaar: OpleverToewijsbaar
  standaardNaam: string
}) {
  const router = useRouter()
  const [puntOpen, setPuntOpen] = useState(false)
  const [tekenOpen, setTekenOpen] = useState(false)
  const [deelOpen, setDeelOpen] = useState(false)

  const herlaad = () => router.refresh()
  const alleKlaar = moment.aantalTotaal > 0 && moment.aantalOpen === 0
  const pct = moment.aantalTotaal > 0 ? (moment.aantalGeaccepteerd / moment.aantalTotaal) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {/* Stand van zaken */}
        <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: GRIJS }}>
              {opleverMomentStatusLabels[moment.status]}
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: alleKlaar ? GROEN : TEKST }}>
              {moment.aantalGeaccepteerd}/{moment.aantalTotaal}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: VLAK, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: GROEN }} />
          </div>
          {alleKlaar && (
            <div style={{ fontSize: 13, fontWeight: 600, color: GROEN, marginTop: 9 }}>
              Alle punten geaccepteerd — klaar om te laten tekenen.
            </div>
          )}
          {moment.handtekeningen.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {moment.handtekeningen.map(h => (
                <div key={h.id} style={{ border: `1px solid ${RAND}`, borderRadius: 9, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {h.handtekening_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={h.handtekening_url} alt="handtekening" style={{ height: 26, width: 60, objectFit: 'contain' }} />
                    : <span style={{ fontSize: 12, color: GROEN }}>✓ akkoord</span>}
                  <div style={{ fontSize: 11, color: GRIJS }}>
                    <div style={{ fontWeight: 600, color: TEKST }}>{h.rol}</div>
                    {h.naam && <div>{h.naam}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Punten */}
        {moment.punten.length === 0 ? (
          <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 14, padding: 20, textAlign: 'center', fontSize: 14, color: GRIJS }}>
            Nog geen opleverpunten. Voeg het eerste punt toe.
          </div>
        ) : (
          moment.punten.map(p => (
            <PuntKaart key={p.id} punt={p} prefix="OP" toewijsbaar={toewijsbaar} onWijzig={herlaad} />
          ))
        )}

        <button type="button" onClick={() => setPuntOpen(true)} style={{ ...secundaireKnop, width: '100%' }}>
          + Opleverpunt
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setDeelOpen(true)} style={{ ...secundaireKnop, flex: 1 }}>
            Delen
          </button>
          <a href={`/api/oplevering/rapport/${moment.id}`} target="_blank" rel="noreferrer"
            style={{ ...secundaireKnop, flex: 1, textAlign: 'center', textDecoration: 'none' }}>
            Rapport
          </a>
        </div>
      </div>

      <MobielStickyFooter>
        <button type="button" onClick={() => setTekenOpen(true)}
          style={{ ...primaireKnop, width: '100%', background: alleKlaar ? GROEN : '#5b6770' }}>
          Laten ondertekenen
        </button>
      </MobielStickyFooter>

      {puntOpen && (
        <NieuwPuntSheet
          momentId={moment.id}
          toewijsbaar={toewijsbaar}
          onSluit={() => setPuntOpen(false)}
          onKlaar={() => { setPuntOpen(false); herlaad() }}
        />
      )}
      {tekenOpen && (
        <OndertekenSheet
          momentId={moment.id}
          standaardNaam={standaardNaam}
          alleKlaar={alleKlaar}
          onSluit={() => setTekenOpen(false)}
          onKlaar={() => { setTekenOpen(false); herlaad() }}
        />
      )}
      {deelOpen && (
        <DeelSheet moment={moment} dossierId={dossierId} onSluit={() => setDeelOpen(false)} />
      )}
    </div>
  )
}

/* ────────────────────────────── Nieuw punt ───────────────────────────────── */

function NieuwPuntSheet({ momentId, toewijsbaar, onSluit, onKlaar }: {
  momentId: string
  toewijsbaar: OpleverToewijsbaar
  onSluit: () => void
  onKlaar: () => void
}) {
  const [omschrijving, setOmschrijving] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [toewijzing, setToewijzing] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan() {
    if (!omschrijving.trim()) { setFout('Beschrijf wat er nog moet gebeuren.'); return }
    setBezig(true); setFout(null)

    // De keuzelijst codeert type en id in één waarde, zodat er maar één select nodig is op een
    // telefoon: "medewerker:<id>" of "relatie:<id>".
    const [type, id] = toewijzing ? toewijzing.split(':') : []
    const r = await maakOpleverpunt(momentId, {
      omschrijving: omschrijving.trim(),
      ruimte: ruimte.trim() || null,
      toegewezen_type: (type as OpleverToewijzingType) || null,
      toegewezen_medewerker_id: type === 'medewerker' ? id : null,
      toegewezen_relatie_id: type === 'relatie' ? id : null,
    })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    onKlaar()
  }

  return (
    <BottomSheet titel="Opleverpunt toevoegen" onSluit={onSluit}>
      {fout && <Fout tekst={fout} />}
      <div>
        <label style={label} htmlFor="op-oms">Wat moet er nog gebeuren?</label>
        {/* Inspreken scheelt op locatie veel tijd; typen op een telefoon met werkhandschoenen niet. */}
        <SpraakTextarea id="op-oms" style={{ ...veld, minHeight: 88, resize: 'vertical' }}
          value={omschrijving} onChange={setOmschrijving}
          placeholder="Beschrijf of spreek het punt in" />
      </div>
      <div>
        <label style={label} htmlFor="op-ruimte">Ruimte / locatie</label>
        <input id="op-ruimte" style={veld} value={ruimte} onChange={e => setRuimte(e.target.value)}
          placeholder="Bijv. hal, kozijn achtergevel" />
      </div>
      <div>
        <label style={label} htmlFor="op-toew">Toewijzen aan</label>
        <select id="op-toew" style={veld} value={toewijzing} onChange={e => setToewijzing(e.target.value)}>
          <option value="">Niet toegewezen</option>
          <optgroup label="Medewerkers">
            {toewijsbaar.medewerkers.map(m => (
              <option key={m.id} value={`medewerker:${m.id}`}>{m.naam}</option>
            ))}
          </optgroup>
          <optgroup label="Onderaannemers / leveranciers">
            {toewijsbaar.relaties.map(r => (
              <option key={r.id} value={`relatie:${r.id}`}>{r.naam}{r.onderaannemer ? ' (OA)' : ''}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <button type="button" onClick={opslaan} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {bezig ? 'Opslaan…' : 'Toevoegen'}
      </button>
    </BottomSheet>
  )
}

/* ───────────────────────────── Ondertekenen ──────────────────────────────── */

const ROLLEN: { waarde: OpleverHandtekeningRol; label: string }[] = [
  { waarde: 'opdrachtgever', label: 'Opdrachtgever' },
  { waarde: 'opzichter', label: 'Opzichter' },
  { waarde: 'uitvoerder', label: 'Uitvoerder' },
]

function OndertekenSheet({ momentId, standaardNaam, alleKlaar, onSluit, onKlaar }: {
  momentId: string
  standaardNaam: string
  alleKlaar: boolean
  onSluit: () => void
  onKlaar: () => void
}) {
  const [rol, setRol] = useState<OpleverHandtekeningRol>('opdrachtgever')
  const [naam, setNaam] = useState('')
  const [b64, setB64] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function vastleggen() {
    if (!b64) { setFout('Zet eerst een handtekening.'); return }
    setBezig(true); setFout(null)
    const r = await voegHandtekeningToe(momentId, {
      rol,
      naam: (naam.trim() || (rol === 'uitvoerder' ? standaardNaam : '')) || null,
      handtekening_b64: b64,
      methode: 'pad',
    })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    onKlaar()
  }

  return (
    <BottomSheet titel="Ondertekenen" onSluit={onSluit}>
      {fout && <Fout tekst={fout} />}
      {!alleKlaar && (
        <div style={{ background: '#fdf8ec', border: '1px solid #f0dfb8', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: AMBER }}>
          Er staan nog punten open. Ondertekenen kan, maar dan tekent de klant onder voorbehoud.
        </div>
      )}
      <div>
        <label style={label} htmlFor="ht-rol">Wie tekent er?</label>
        <select id="ht-rol" style={veld} value={rol}
          onChange={e => setRol(e.target.value as OpleverHandtekeningRol)}>
          {ROLLEN.map(r => <option key={r.waarde} value={r.waarde}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label style={label} htmlFor="ht-naam">Naam</label>
        <input id="ht-naam" style={veld} value={naam} onChange={e => setNaam(e.target.value)}
          placeholder={rol === 'uitvoerder' ? standaardNaam : 'Naam ondertekenaar'} />
      </div>
      <div>
        <span style={label}>Handtekening</span>
        <HandtekeningPad onChange={setB64} hoogte={180} />
      </div>
      <button type="button" onClick={vastleggen} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {bezig ? 'Vastleggen…' : 'Handtekening vastleggen'}
      </button>
    </BottomSheet>
  )
}

/* ──────────────────────────────── Delen ──────────────────────────────────── */

function DeelSheet({ moment, dossierId, onSluit }: {
  moment: OpleverMomentView
  dossierId: string
  onSluit: () => void
}) {
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  // Distinct onderaannemers/leveranciers onder de punten van dit moment.
  const relaties = new Map<string, string>()
  for (const p of moment.punten) {
    if (p.toegewezen_type === 'relatie' && p.toegewezen_relatie_id) {
      relaties.set(p.toegewezen_relatie_id, p.toegewezenNaam ?? 'Partij')
    }
  }

  /**
   * Deelt via het deelvenster van de telefoon — dan gaat de link in twee tikken naar WhatsApp,
   * Teams of mail. Kan de browser dat niet, dan het klembord. Lukt dat ook niet, dan tonen we de
   * link zelf: nooit een succesmelding voor iets dat niet gebeurd is.
   */
  async function deel(url: string, titel: string) {
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> }
    if (nav.share) {
      try { await nav.share({ title: titel, url }); return } catch { /* gebruiker brak af of het lukte niet */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setMelding(`Link gekopieerd — ${titel}`)
    } catch {
      setFout(url)
    }
  }

  async function afmeldLink(relatieId: string, naam: string) {
    setBezig(true); setFout(null); setMelding(null)
    const r = await maakToegangToken('onderaannemer', { dossierId, relatieId, geldigDagen: 30, omschrijving: naam })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    deel(r.url, `afmeldlink ${naam}`)
  }

  async function akkoordLink() {
    setBezig(true); setFout(null); setMelding(null)
    const r = await maakToegangToken('ondertekening', { dossierId, momentId: moment.id, geldigDagen: 30 })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    deel(r.url, 'akkoord opdrachtgever')
  }

  return (
    <BottomSheet titel="Delen" onSluit={onSluit}>
      {melding && (
        <div style={{ background: '#eef8f1', border: `1px solid ${GROEN}33`, color: GROEN, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          {melding}
        </div>
      )}
      {fout && <Fout tekst={fout} />}

      <div style={{ fontSize: 13, color: GRIJS }}>
        De ontvanger heeft geen EVA-account nodig; hij ziet alleen wat bij deze link hoort.
      </div>

      <button type="button" onClick={akkoordLink} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        Akkoordlink opdrachtgever
      </button>

      {[...relaties.entries()].map(([id, naam]) => (
        <button key={id} type="button" onClick={() => afmeldLink(id, naam)} disabled={bezig}
          style={{ ...secundaireKnop, width: '100%' }}>
          Afmeldlink: {naam}
        </button>
      ))}
      {relaties.size === 0 && (
        <div style={{ fontSize: 12.5, color: ZACHT }}>
          Wijs een punt toe aan een onderaannemer om daar een afmeldlink voor te maken.
        </div>
      )}
    </BottomSheet>
  )
}

function Fout({ tekst }: { tekst: string }) {
  return (
    <div style={{
      background: '#fdf1f0', border: '1px solid #f0c8c2', color: '#b42318',
      borderRadius: 10, padding: '10px 12px', fontSize: 13, wordBreak: 'break-all',
    }}>
      {tekst}
    </div>
  )
}
