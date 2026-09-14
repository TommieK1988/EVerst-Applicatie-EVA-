'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import {
  corrigeerUurregel, getUursoortenVoorCorrectie, zoekDossierVoorUren,
  type UursoortOptie, type DossierTreffer,
} from '@/lib/uren/bouw7-goedkeuring'
import { getBewakingscodesVoorUurlog, type BewakingscodeOptie } from '@/lib/dossiers/actions'

/**
 * Een geboekte urenregel aanpassen vóór goedkeuring.
 *
 * Afkeuren bestaat niet: Bouw7 kent alleen goedgekeurd of niet, en een regel heen en weer sturen
 * kost alleen tijd. De goedkeurder zet het hier recht en de medewerker krijgt daar bericht van.
 *
 * Vier dingen zijn bij te stellen: het aantal uren, de uursoort, het dossier en de bewakingscode.
 * Uursoort en dossier zitten hier omdat dát de fouten zijn die de medewerker op zijn telefoon
 * maakt -- reisuren op gewerkte uren, of het buurdossier aangetikt. Op mobiel kan dit bewust niet:
 * daar corrigeert de teamleider alleen uren en code; verplaatsen is werk voor een groot scherm.
 *
 * De bewakingscodelijst komt hier zónder het prognose-filter binnen: dit is corrigeren, niet
 * invoeren. Een uur dat op de verkeerde code staat moet naar élke code te verplaatsen zijn, ook
 * naar een code waar niets voor begroot is.
 */

export type TeBewerkenRegel = {
  hourLogId: number
  medewerkerNaam: string
  datum: string
  uren: number
  uursoort: string | null
  /** Bouw7 hourType-id van de huidige uursoort; null als Bouw7 hem niet meegaf. */
  hourTypeId: number | null
  dossierId: string | null
  dossierLabel: string | null
  bewakingscode: string | null
  opmerking: string | null
}

const veld: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
  color: 'var(--fg-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
}

const knopjeStijl: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 600, color: 'var(--accent)',
}

/** 'werk' eerst, dan de rest: dat is waar vrijwel elke correctie naartoe gaat. */
const CATEGORIE_KOP: Record<string, string> = {
  werk: 'Gewerkt', tijd_voor_tijd: 'Tijd voor tijd', afwezig: 'Afwezig', feestdag: 'Feestdag',
}
const CATEGORIE_VOLGORDE = ['werk', 'tijd_voor_tijd', 'feestdag', 'afwezig', '']

export default function UurregelBewerken({
  regel, onSluit, onKlaar,
}: {
  regel: TeBewerkenRegel
  onSluit: () => void
  onKlaar: () => void
}) {
  const [uren, setUren] = useState(String(regel.uren).replace('.', ','))
  const [uursoortId, setUursoortId] = useState<number | null>(regel.hourTypeId)
  const [uursoorten, setUursoorten] = useState<UursoortOptie[]>([])
  const [code, setCode] = useState(regel.bewakingscode ?? '')
  const [opmerking, setOpmerking] = useState(regel.opmerking ?? '')
  const [codes, setCodes] = useState<BewakingscodeOptie[]>([])
  const [codesLaden, setCodesLaden] = useState(false)
  const [bezig, setBezig] = useState(false)

  // Verplaatsen naar een ander dossier. `doel` is leeg zolang de regel blijft staan waar hij staat.
  const [zoekOpen, setZoekOpen] = useState(false)
  const [zoekterm, setZoekterm] = useState('')
  const [treffers, setTreffers] = useState<DossierTreffer[]>([])
  const [zoekt, setZoekt] = useState(false)
  const [doel, setDoel] = useState<DossierTreffer | null>(null)

  const dossierId = doel?.id ?? regel.dossierId
  const verhuist = doel != null && doel.id !== regel.dossierId

  useEffect(() => { getUursoortenVoorCorrectie().then(setUursoorten).catch(() => {}) }, [])

  // De codelijst hangt aan het dossier waar de regel na opslaan op staat, niet aan het dossier
  // waar hij vandaan komt: anders kies je een code die op het doeldossier niet bestaat.
  useEffect(() => {
    if (!dossierId) { setCodes([]); return }
    let levend = true
    setCodesLaden(true)
    getBewakingscodesVoorUurlog(dossierId)
      .then(c => { if (levend) setCodes(c) })
      .finally(() => { if (levend) setCodesLaden(false) })
    return () => { levend = false }
  }, [dossierId])

  useEffect(() => {
    if (!zoekOpen) return
    const term = zoekterm.trim()
    if (term.length < 2) { setTreffers([]); setZoekt(false); return }
    let levend = true
    setZoekt(true)
    const t = setTimeout(() => {
      zoekDossierVoorUren(term)
        .then(r => { if (levend) setTreffers(r) })
        .catch(() => { if (levend) setTreffers([]) })
        .finally(() => { if (levend) setZoekt(false) })
    }, 300)
    return () => { levend = false; clearTimeout(t) }
  }, [zoekterm, zoekOpen])

  function kiesDossier(d: DossierTreffer) {
    setDoel(d)
    setZoekOpen(false)
    setZoekterm('')
    setTreffers([])
    // De oude code hoort bij het oude project en kan niet mee.
    setCode('')
  }

  function herstelDossier() {
    setDoel(null)
    setCode(regel.bewakingscode ?? '')
  }

  async function bewaar() {
    const getal = parseFloat(uren.replace(',', '.'))
    if (Number.isNaN(getal) || !(getal > 0 && getal <= 24)) {
      toast.error('Vul een aantal uren tussen 0 en 24 in.')
      return
    }
    if (verhuist && codes.length > 0 && !code) {
      toast.error('Kies een bewakingscode op het dossier waar de uren naartoe gaan.')
      return
    }
    const gekozen = codes.find(c => c.code === code)
    // Bij een verhuizing gaat de code altijd mee, ook als hij toevallig dezelfde naam heeft:
    // het is een andere bewakingscode, van een ander project.
    const codeGewijzigd = verhuist || code !== (regel.bewakingscode ?? '')
    setBezig(true)
    const r = await corrigeerUurregel(regel.hourLogId, {
      ...(getal !== regel.uren ? { uren: getal } : {}),
      ...(codeGewijzigd ? { bewakingscodePslId: gekozen?.pslId ?? null } : {}),
      ...(opmerking !== (regel.opmerking ?? '') ? { opmerking } : {}),
      ...(uursoortId != null && uursoortId !== regel.hourTypeId ? { uursoortHourTypeId: uursoortId } : {}),
      ...(verhuist ? { naarDossierId: doel!.id } : {}),
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aangepast; de medewerker heeft bericht gekregen.')
    onKlaar()
    onSluit()
  }

  const nietsGewijzigd =
    parseFloat(uren.replace(',', '.')) === regel.uren &&
    code === (regel.bewakingscode ?? '') &&
    opmerking === (regel.opmerking ?? '') &&
    uursoortId === regel.hourTypeId &&
    !verhuist

  const gegroepeerd = CATEGORIE_VOLGORDE
    .map(cat => ({ cat, soorten: uursoorten.filter(u => (u.categorie ?? '') === cat) }))
    .filter(g => g.soorten.length > 0)
  // Een uursoort die Bouw7 wel kent maar EVA niet in zijn stamlijst heeft, zou anders stil
  // omklappen naar de eerste optie in de lijst.
  const onbekendeUursoort = uursoortId != null && uursoorten.length > 0
    && !uursoorten.some(u => u.hourTypeId === uursoortId)

  return (
    <div
      onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
    >
      {/* Geen transform-centrering: dat botst met een transform-animatie en zet het venster scheef. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
          background: 'var(--bg-elev)', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)', padding: 20,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
            Uren aanpassen
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
            {regel.medewerkerNaam} · {regel.datum}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={labelStijl}>Aantal uren</label>
            <input type="text" inputMode="decimal" value={uren} onChange={e => setUren(e.target.value)}
              style={{ ...veld, width: 110 }} autoFocus />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={labelStijl}>Uursoort</label>
            <select
              value={uursoortId ?? ''}
              onChange={e => setUursoortId(e.target.value ? Number(e.target.value) : null)}
              style={veld}
              disabled={uursoorten.length === 0}
            >
              {(uursoorten.length === 0 || onbekendeUursoort) && (
                <option value={uursoortId ?? ''}>{regel.uursoort ?? '— onbekend —'}</option>
              )}
              {gegroepeerd.map(g => (
                <optgroup key={g.cat} label={CATEGORIE_KOP[g.cat] ?? 'Overig'}>
                  {g.soorten.map(u => (
                    <option key={u.hourTypeId} value={u.hourTypeId}>{u.naam}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <label style={labelStijl}>Dossier</label>
            {verhuist ? (
              <button type="button" style={knopjeStijl} onClick={herstelDossier}>Toch niet verplaatsen</button>
            ) : (
              <button type="button" style={knopjeStijl} onClick={() => setZoekOpen(o => !o)}>
                {zoekOpen ? 'Annuleren' : 'Naar ander dossier'}
              </button>
            )}
          </div>

          <div style={{
            ...veld, display: 'flex', alignItems: 'center', gap: 8,
            background: verhuist ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--bg)',
            borderColor: verhuist ? 'var(--accent)' : 'var(--border)',
          }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {verhuist
                ? [doel!.nummer, doel!.titel].filter(Boolean).join(' · ')
                : (regel.dossierLabel ?? '— geen dossier —')}
            </span>
          </div>

          {verhuist && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
              Stond op {regel.dossierLabel ?? 'geen dossier'}. De goedkeuring begint opnieuw bij de
              teamleider en projectleider van het nieuwe dossier.
            </p>
          )}

          {zoekOpen && !verhuist && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                value={zoekterm}
                onChange={e => setZoekterm(e.target.value)}
                placeholder="Zoek op dossiernummer of titel"
                style={veld}
                autoFocus
              />
              <div style={{
                marginTop: 6, maxHeight: 210, overflowY: 'auto',
                border: treffers.length ? '1px solid var(--border)' : 'none', borderRadius: 8,
              }}>
                {zoekt && (
                  <div style={{ padding: '8px 11px', fontSize: 12, color: 'var(--fg-muted)' }}>Bezig met zoeken…</div>
                )}
                {!zoekt && zoekterm.trim().length >= 2 && treffers.length === 0 && (
                  <div style={{ padding: '8px 11px', fontSize: 12, color: 'var(--fg-muted)' }}>
                    Geen dossier gevonden dat aan Bouw7 gekoppeld is.
                  </div>
                )}
                {treffers.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => kiesDossier(d)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '8px 11px', border: 'none', borderBottom: '1px solid var(--border)',
                      background: 'transparent', fontFamily: 'var(--font-ui)',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)' }}>{d.nummer ?? '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 8 }}>{d.titel ?? ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {dossierId && (
          <div>
            <label style={labelStijl}>Bewakingscode</label>
            <select value={code} onChange={e => setCode(e.target.value)} style={veld} disabled={codesLaden}>
              <option value="">{codesLaden ? 'Bezig met ophalen…' : '— geen code —'}</option>
              {codes.map(c => (
                <option key={c.pslId} value={c.code}>
                  {c.code}{c.naam ? ` · ${c.naam}` : ''}
                  {c.prognoseUren > 0 ? ` (${c.prognoseUren}u begroot)` : ''}
                </option>
              ))}
            </select>
            {verhuist && !codesLaden && codes.length === 0 && (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: '6px 0 0' }}>
                Dit dossier heeft nog geen bewakingscodes; de uren komen er zonder code op te staan.
              </p>
            )}
          </div>
        )}

        <div>
          <label style={labelStijl}>Opmerking</label>
          <input type="text" value={opmerking} onChange={e => setOpmerking(e.target.value)}
            placeholder="Optioneel" style={veld} />
        </div>

        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
          De wijziging gaat meteen naar Bouw7 en de medewerker krijgt een melding. Wat er stond
          blijft in EVA bewaard, zodat later na te gaan is wat er is aangepast.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onSluit}>Annuleren</Button>
          <Button variant="primary" size="sm" onClick={bewaar} loading={bezig}
            disabled={bezig || nietsGewijzigd}>
            Opslaan
          </Button>
        </div>
      </div>
    </div>
  )
}
