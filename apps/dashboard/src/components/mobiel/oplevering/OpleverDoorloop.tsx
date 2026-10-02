'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OpleverHandtekeningRol, OpleverToewijzingType } from '@everts/database'
import {
  maakOpleverpunt, maakToegangToken, voegHandtekeningToe,
  type OpleverMomentView, type OpleverToewijsbaar,
} from '@/lib/dossiers/oplevering'
import HandtekeningPad from '@/components/planning/werkbon/HandtekeningPad'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import PuntKaart from './PuntKaart'
import BottomSheet from '../BottomSheet'
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
  const t = useTranslations('oplevering')
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
              {t(`momentStatus.${moment.status}`)}
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
              {t('doorloop.alleGeaccepteerd')}
            </div>
          )}
          {moment.handtekeningen.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {moment.handtekeningen.map(h => (
                <div key={h.id} style={{ border: `1px solid ${RAND}`, borderRadius: 9, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {h.handtekening_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={h.handtekening_url} alt={t('doorloop.handtekeningAlt')} style={{ height: 26, width: 60, objectFit: 'contain' }} />
                    : <span style={{ fontSize: 12, color: GROEN }}>{t('doorloop.akkoord')}</span>}
                  <div style={{ fontSize: 11, color: GRIJS }}>
                    <div style={{ fontWeight: 600, color: TEKST }}>{t(`rol.${h.rol}`)}</div>
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
            {t('doorloop.geenPunten')}
          </div>
        ) : (
          moment.punten.map(p => (
            <PuntKaart key={p.id} punt={p} prefix="OP" toewijsbaar={toewijsbaar} onWijzig={herlaad} />
          ))
        )}

        <button type="button" onClick={() => setPuntOpen(true)} style={{ ...secundaireKnop, width: '100%' }}>
          {t('doorloop.knopPunt')}
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setDeelOpen(true)} style={{ ...secundaireKnop, flex: 1 }}>
            {t('doorloop.knopDelen')}
          </button>
          <a href={`/api/oplevering/rapport/${moment.id}`} target="_blank" rel="noreferrer"
            style={{ ...secundaireKnop, flex: 1, textAlign: 'center', textDecoration: 'none' }}>
            {t('doorloop.knopRapport')}
          </a>
        </div>
      </div>

      <MobielStickyFooter>
        <button type="button" onClick={() => setTekenOpen(true)}
          style={{ ...primaireKnop, width: '100%', background: alleKlaar ? GROEN : '#5b6770' }}>
          {t('doorloop.knopOndertekenen')}
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
  const t = useTranslations('oplevering')
  const [omschrijving, setOmschrijving] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [toewijzing, setToewijzing] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan() {
    if (!omschrijving.trim()) { setFout(t('nieuwPunt.foutLeeg')); return }
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
    <BottomSheet titel={t('nieuwPunt.titel')} onSluit={onSluit}>
      {fout && <Fout tekst={fout} />}
      <div>
        <label style={label} htmlFor="op-oms">{t('nieuwPunt.omschrijving')}</label>
        {/* Inspreken scheelt op locatie veel tijd; typen op een telefoon met werkhandschoenen niet. */}
        <SpraakTextarea id="op-oms" style={{ ...veld, minHeight: 88, resize: 'vertical' }}
          value={omschrijving} onChange={setOmschrijving}
          placeholder={t('nieuwPunt.omschrijvingPlaceholder')} />
      </div>
      <div>
        <label style={label} htmlFor="op-ruimte">{t('nieuwPunt.ruimte')}</label>
        <input id="op-ruimte" style={veld} value={ruimte} onChange={e => setRuimte(e.target.value)}
          placeholder={t('nieuwPunt.ruimtePlaceholder')} />
      </div>
      <div>
        <label style={label} htmlFor="op-toew">{t('toewijzen.label')}</label>
        <select id="op-toew" style={veld} value={toewijzing} onChange={e => setToewijzing(e.target.value)}>
          <option value="">{t('toewijzen.nietToegewezen')}</option>
          <optgroup label={t('nieuwPunt.groepMedewerkers')}>
            {toewijsbaar.medewerkers.map(m => (
              <option key={m.id} value={`medewerker:${m.id}`}>{m.naam}</option>
            ))}
          </optgroup>
          <optgroup label={t('nieuwPunt.groepRelaties')}>
            {toewijsbaar.relaties.map(r => (
              <option key={r.id} value={`relatie:${r.id}`}>{r.onderaannemer ? t('toewijzen.relatieOA', { naam: r.naam }) : r.naam}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <button type="button" onClick={opslaan} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {bezig ? t('nieuwPunt.opslaan') : t('nieuwPunt.knopToevoegen')}
      </button>
    </BottomSheet>
  )
}

/* ───────────────────────────── Ondertekenen ──────────────────────────────── */

/** Volgorde van de keuzelijst; de labels staan in `oplevering.rol`. */
const ROLLEN: OpleverHandtekeningRol[] = ['opdrachtgever', 'opzichter', 'uitvoerder']

function OndertekenSheet({ momentId, standaardNaam, alleKlaar, onSluit, onKlaar }: {
  momentId: string
  standaardNaam: string
  alleKlaar: boolean
  onSluit: () => void
  onKlaar: () => void
}) {
  const t = useTranslations('oplevering')
  const [rol, setRol] = useState<OpleverHandtekeningRol>('opdrachtgever')
  const [naam, setNaam] = useState('')
  const [b64, setB64] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function vastleggen() {
    if (!b64) { setFout(t('ondertekenen.foutGeenHandtekening')); return }
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
    <BottomSheet titel={t('ondertekenen.titel')} onSluit={onSluit}>
      {fout && <Fout tekst={fout} />}
      {!alleKlaar && (
        <div style={{ background: '#fdf8ec', border: '1px solid #f0dfb8', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: AMBER }}>
          {t('ondertekenen.nogPuntenOpen')}
        </div>
      )}
      <div>
        <label style={label} htmlFor="ht-rol">{t('ondertekenen.wieTekent')}</label>
        <select id="ht-rol" style={veld} value={rol}
          onChange={e => setRol(e.target.value as OpleverHandtekeningRol)}>
          {ROLLEN.map(r => <option key={r} value={r}>{t(`rol.${r}`)}</option>)}
        </select>
      </div>
      <div>
        <label style={label} htmlFor="ht-naam">{t('ondertekenen.naam')}</label>
        <input id="ht-naam" style={veld} value={naam} onChange={e => setNaam(e.target.value)}
          placeholder={rol === 'uitvoerder' ? standaardNaam : t('ondertekenen.naamPlaceholder')} />
      </div>
      <div>
        <span style={label}>{t('ondertekenen.handtekening')}</span>
        <HandtekeningPad onChange={setB64} hoogte={180} />
      </div>
      <button type="button" onClick={vastleggen} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {bezig ? t('ondertekenen.vastleggen') : t('ondertekenen.knopVastleggen')}
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
  const t = useTranslations('oplevering')
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  // Distinct onderaannemers/leveranciers onder de punten van dit moment.
  const relaties = new Map<string, string>()
  for (const p of moment.punten) {
    if (p.toegewezen_type === 'relatie' && p.toegewezen_relatie_id) {
      relaties.set(p.toegewezen_relatie_id, p.toegewezenNaam ?? t('delen.partij'))
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
      setMelding(t('delen.linkGekopieerd', { titel }))
    } catch {
      setFout(url)
    }
  }

  async function afmeldLink(relatieId: string, naam: string) {
    setBezig(true); setFout(null); setMelding(null)
    const r = await maakToegangToken('onderaannemer', { dossierId, relatieId, geldigDagen: 30, omschrijving: naam })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    deel(r.url, t('delen.titelAfmeldlink', { naam }))
  }

  async function akkoordLink() {
    setBezig(true); setFout(null); setMelding(null)
    const r = await maakToegangToken('ondertekening', { dossierId, momentId: moment.id, geldigDagen: 30 })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    deel(r.url, t('delen.titelAkkoord'))
  }

  return (
    <BottomSheet titel={t('delen.titel')} onSluit={onSluit}>
      {melding && (
        <div style={{ background: '#eef8f1', border: `1px solid ${GROEN}33`, color: GROEN, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          {melding}
        </div>
      )}
      {fout && <Fout tekst={fout} />}

      <div style={{ fontSize: 13, color: GRIJS }}>
        {t('delen.uitleg')}
      </div>

      <button type="button" onClick={akkoordLink} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {t('delen.knopAkkoordlink')}
      </button>

      {[...relaties.entries()].map(([id, naam]) => (
        <button key={id} type="button" onClick={() => afmeldLink(id, naam)} disabled={bezig}
          style={{ ...secundaireKnop, width: '100%' }}>
          {t('delen.knopAfmeldlink', { naam })}
        </button>
      ))}
      {relaties.size === 0 && (
        <div style={{ fontSize: 12.5, color: ZACHT }}>
          {t('delen.geenRelaties')}
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
