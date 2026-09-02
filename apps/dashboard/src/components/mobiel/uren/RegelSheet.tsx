'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { UursoortOptie, WeekRegel, RegelInvoer } from '@/lib/uren/weekstaat'
import { getDossierOpties } from '@/lib/uren/weekstaat'
import { getBewakingscodesVoorUurlog, type BewakingscodeOptie } from '@/lib/dossiers/actions'

/**
 * Bottom sheet om één urenregel toe te voegen of te wijzigen.
 *
 * De volgorde volgt wat de monteur weet: eerst wát hij deed (uursoort), dan wáár (project +
 * bewakingscode, alleen bij werk-uren), dan hoeveel. De uren gaan met grote plus/min-knoppen in
 * stappen van een kwartier — tikken in een cijferveld is op een telefoon met werkhanden lastig.
 */

const veld: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'inherit', fontSize: 15, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#6b757c',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
}

const CATEGORIE_KOP: Record<string, string> = {
  werk: 'Gewerkt',
  tijd_voor_tijd: 'Tijd voor tijd',
  afwezig: 'Niet gewerkt',
  feestdag: 'Feestdag',
}

export default function RegelSheet({
  datum, uursoorten, regel, onSluit, onBewaar,
}: {
  datum: string
  uursoorten: UursoortOptie[]
  /** Gevuld = bewerken, leeg = nieuw. */
  regel: WeekRegel | null
  onSluit: () => void
  onBewaar: (invoer: RegelInvoer) => Promise<{ ok: boolean; error?: string }>
}) {
  const [uursoortId, setUursoortId] = useState(regel?.uursoort_id ?? uursoorten[0]?.id ?? '')
  const [uren, setUren] = useState(regel?.uren ?? 8)
  const [dossierId, setDossierId] = useState(regel?.dossier_id ?? '')
  const [code, setCode] = useState(regel?.bewakingscode ?? '')
  const [opmerking, setOpmerking] = useState(regel?.opmerking ?? '')
  const [bezig, setBezig] = useState(false)

  const [dossiers, setDossiers] = useState<Array<{ id: string; label: string; uitPlanning: boolean }>>([])
  const [codes, setCodes] = useState<BewakingscodeOptie[]>([])
  const [codesLaden, setCodesLaden] = useState(false)

  const soort = uursoorten.find(u => u.id === uursoortId)
  const isWerk = soort?.categorie === 'werk'

  // Projecten waar deze medewerker die dag stond staan bovenaan; dat is bijna altijd het antwoord.
  useEffect(() => {
    if (!isWerk) return
    let levend = true
    getDossierOpties(datum).then(d => { if (levend) setDossiers(d) })
    return () => { levend = false }
  }, [datum, isWerk])

  // Alleen codes waar prognose-uren op staan: de monteur kiest uit het werk dat voor dit project
  // begroot is, niet uit de volledige codelijst.
  useEffect(() => {
    if (!isWerk || !dossierId) { setCodes([]); return }
    let levend = true
    setCodesLaden(true)
    getBewakingscodesVoorUurlog(dossierId, { alleenMetPrognose: true })
      .then(c => { if (levend) setCodes(c) })
      .finally(() => { if (levend) setCodesLaden(false) })
    return () => { levend = false }
  }, [dossierId, isWerk])

  async function bewaar() {
    setBezig(true)
    const r = await onBewaar({
      datum,
      uren,
      uursoort_id: uursoortId,
      dossier_id: isWerk ? (dossierId || null) : null,
      bewakingscode: isWerk ? (code || null) : null,
      bouw7_psl_id: isWerk ? (codes.find(c => c.code === code)?.pslId ?? null) : null,
      opmerking: opmerking || null,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error ?? 'Opslaan mislukt.'); return }
    onSluit()
  }

  // Uursoorten gegroepeerd, zodat "Gewerkt" en "Niet gewerkt" visueel uit elkaar liggen.
  const groepen = ['werk', 'tijd_voor_tijd', 'afwezig', 'feestdag']
    .map(c => ({ categorie: c, opties: uursoorten.filter(u => u.categorie === c) }))
    .filter(g => g.opties.length > 0)

  return (
    <div
      onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--bg-elev)',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '8px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d7dde0', margin: '0 auto 16px', flexShrink: 0 }} />
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', marginBottom: 16, flexShrink: 0 }}>
          {regel ? 'Uren aanpassen' : 'Uren toevoegen'}
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Wat */}
          <div>
            <label style={labelStijl}>Wat heb je gedaan?</label>
            <select value={uursoortId} onChange={e => { setUursoortId(e.target.value); setCode('') }} style={veld}>
              {groepen.map(g => (
                <optgroup key={g.categorie} label={CATEGORIE_KOP[g.categorie] ?? g.categorie}>
                  {g.opties.map(o => <option key={o.id} value={o.id}>{o.naam}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {isWerk && (
            <>
              <div>
                <label style={labelStijl}>Project</label>
                <select value={dossierId} onChange={e => { setDossierId(e.target.value); setCode('') }} style={veld}>
                  <option value="">— kies een project —</option>
                  {dossiers.some(d => d.uitPlanning) && (
                    <optgroup label="Je stond hier ingepland">
                      {dossiers.filter(d => d.uitPlanning).map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Overige opdrachten">
                    {dossiers.filter(d => !d.uitPlanning).map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label style={labelStijl}>Bewakingscode</label>
                <select value={code} onChange={e => setCode(e.target.value)} style={veld}
                  disabled={!dossierId || codesLaden}>
                  <option value="">
                    {!dossierId ? '— kies eerst een project —'
                      : codesLaden ? 'Bezig met ophalen…'
                      : codes.length === 0 ? '— geen codes met begrote uren —'
                      : '— kies een code —'}
                  </option>
                  {codes.map(c => (
                    <option key={c.pslId} value={c.code}>
                      {c.code}{c.naam ? ` · ${c.naam}` : ''} ({c.prognoseUren}u begroot)
                    </option>
                  ))}
                </select>
                {dossierId && !codesLaden && codes.length === 0 && (
                  <p style={{ fontSize: 12, color: '#a15c00', margin: '6px 0 0' }}>
                    Op dit project staan geen begrote uren. Vraag je werkvoorbereider om een
                    bewakingscode met uren, of kies een ander project.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Hoeveel */}
          <div>
            <label style={labelStijl}>Hoeveel uur?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button type="button" onClick={() => setUren(u => Math.max(0.25, Math.round((u - 0.25) * 100) / 100))}
                style={stapKnop}>−</button>
              <div style={{
                flex: 1, textAlign: 'center', fontSize: 30, fontWeight: 800,
                fontVariantNumeric: 'tabular-nums', color: 'var(--fg)',
              }}>
                {uren.toLocaleString('nl-NL')}<span style={{ fontSize: 16, fontWeight: 600, color: '#6b757c' }}> uur</span>
              </div>
              <button type="button" onClick={() => setUren(u => Math.min(24, Math.round((u + 0.25) * 100) / 100))}
                style={stapKnop}>+</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {[4, 6, 7.5, 8, 9].map(v => (
                <button key={v} type="button" onClick={() => setUren(v)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                    border: `1.5px solid ${uren === v ? '#009439' : 'var(--border)'}`,
                    background: uren === v ? 'rgba(0,148,57,0.08)' : 'transparent',
                    color: uren === v ? '#009439' : '#6b757c',
                  }}>
                  {v.toLocaleString('nl-NL')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStijl}>Opmerking (optioneel)</label>
            <input type="text" value={opmerking} onChange={e => setOpmerking(e.target.value)}
              placeholder="Bijvoorbeeld: extra werk aan de kozijnen" style={veld} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexShrink: 0 }}>
          <button type="button" onClick={onSluit} style={{ ...actieKnop, background: 'transparent', color: '#6b757c', border: '1px solid var(--border)' }}>
            Annuleren
          </button>
          <button type="button" onClick={bewaar} disabled={bezig}
            style={{ ...actieKnop, background: '#009439', color: '#fff', border: 'none', opacity: bezig ? 0.6 : 1 }}>
            {bezig ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

const stapKnop: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 26, flexShrink: 0,
  border: '1.5px solid var(--border)', background: 'var(--bg)',
  fontSize: 26, fontWeight: 700, color: 'var(--fg)', cursor: 'pointer', lineHeight: 1,
}

const actieKnop: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 11, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
}
