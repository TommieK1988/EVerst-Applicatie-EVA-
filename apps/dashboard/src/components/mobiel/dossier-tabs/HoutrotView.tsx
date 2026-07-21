'use client'

import { useCallback, useEffect, useState } from 'react'
import { getRegistraties, createRegistratie, uploadPhoto } from '@/services/houtrotherstel/registraties'
import { getRecepten, type Recept } from '@/services/houtrotherstel/recepten'
import { getHuidigeMedewerker } from '@/services/houtrotherstel/identiteit'
import {
  GEVEL_ZIJDEN, ONDERDEEL_TYPEN, SCHADE_SEVERITY, REGISTRATIE_STATUSSEN,
  type RepairRegistration, type RegistratieForm, type SchadeSeverity,
} from '@/lib/houtrotherstel/types'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'

/**
 * Houtrot binnen een dossier (mobiel). Registraties hangen aan het dossier, niet
 * meer aan een losse houtrot-projectenlijst. Deze tab verschijnt alleen als de
 * dossier-toggle `houtrot_registreren` aanstaat.
 *
 * Twee standen in één component (lijst / invoeren) zodat er geen extra routes en
 * dus geen extra navigatiestappen op de telefoon nodig zijn.
 */
const veld: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: '1px solid #e3e8ea', background: '#fff',
  fontSize: 16, // voorkomt inzoomen op iOS
  color: '#161b20', fontFamily: 'inherit',
}
const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#6b757c', marginBottom: 5, display: 'block',
}

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e8ea', borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b757c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        {titel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

export default function HoutrotView({ dossierId }: { dossierId: string }) {
  const [registraties, setRegistraties] = useState<RepairRegistration[] | null>(null)
  const [recepten, setRecepten] = useState<Recept[]>([])
  const [invoeren, setInvoeren] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const [blok, setBlok] = useState('')
  const [verdieping, setVerdieping] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [gevelzijde, setGevelzijde] = useState('')
  const [onderdeel, setOnderdeel] = useState('')
  const [elementnr, setElementnr] = useState('')
  const [schade, setSchade] = useState('')
  const [ernst, setErnst] = useState<SchadeSeverity | ''>('')
  const [reparatieId, setReparatieId] = useState('')
  const [notitie, setNotitie] = useState('')
  const [voorFoto, setVoorFoto] = useState<File | null>(null)
  const [naFoto, setNaFoto] = useState<File | null>(null)

  const laad = useCallback(() => {
    getRegistraties({ dossier_id: dossierId })
      .then(setRegistraties)
      .catch(e => setFout(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [dossierId])

  useEffect(() => { laad() }, [laad])
  useEffect(() => {
    getRecepten().then(setRecepten).catch(() => setRecepten([]))
  }, [])

  function leegmaken() {
    setBlok(''); setVerdieping(''); setRuimte(''); setGevelzijde(''); setOnderdeel('')
    setElementnr(''); setSchade(''); setErnst(''); setReparatieId(''); setNotitie('')
    setVoorFoto(null); setNaFoto(null)
  }

  async function opslaan() {
    setBezig(true)
    setFout(null)
    try {
      const medewerker = await getHuidigeMedewerker()
      if (!medewerker) throw new Error('Geen medewerker-koppeling gevonden voor dit account.')

      const recept = recepten.find(r => r.id === reparatieId)
      const form: RegistratieForm = {
        dossier_id: dossierId,
        recept_id: reparatieId || undefined,
        registration_date: new Date().toISOString().slice(0, 10),
        location_block: blok || undefined,
        floor: verdieping || undefined,
        room_or_unit: ruimte || undefined,
        facade_side: gevelzijde || undefined,
        component_type: onderdeel || undefined,
        element_number: elementnr || undefined,
        damage_description: schade || undefined,
        damage_severity: ernst || undefined,
        notes: notitie || undefined,
        status: 'open',
        control_status: 'niet_gecontroleerd',
        // Prijs wordt als momentopname vastgelegd: latere wijzigingen aan het
        // recept of aan het uurtarief veranderen bestaande registraties niet.
        ...(recept && {
          repair_code_snapshot: recept.code,
          repair_name_snapshot: recept.naam,
          repair_description_snapshot: recept.omschrijving ?? undefined,
          labor_hours_snapshot: recept.uren,
          labor_rate_snapshot: recept.uurtarief,
          labor_cost_snapshot: recept.arbeidskosten,
          material_cost_snapshot: recept.materiaalkosten,
          cost_price_snapshot: recept.kostprijs,
          sale_price_snapshot: recept.verkoopprijs,
        }),
      }

      const registratie = await createRegistratie(form, medewerker.id)
      if (voorFoto) await uploadPhoto(registratie.id, voorFoto, 'voor').catch(() => null)
      if (naFoto) await uploadPhoto(registratie.id, naFoto, 'na').catch(() => null)

      leegmaken()
      setInvoeren(false)
      setRegistraties(null)
      laad()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  // ── Invoerstand ────────────────────────────────────────────────────────────
  if (invoeren) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {fout && (
            <div style={{ background: '#fdf1f0', border: '1px solid #f0c8c2', color: '#b42318', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
              {fout}
            </div>
          )}

          <Blok titel="Plaats">
            <div>
              <label style={label} htmlFor="hr-blok">Blok</label>
              <input id="hr-blok" style={veld} value={blok} onChange={e => setBlok(e.target.value)} placeholder="bijv. Blok A" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={label} htmlFor="hr-verdieping">Verdieping</label>
                <input id="hr-verdieping" style={veld} value={verdieping} onChange={e => setVerdieping(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label} htmlFor="hr-ruimte">Ruimte / nr.</label>
                <input id="hr-ruimte" style={veld} value={ruimte} onChange={e => setRuimte(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={label} htmlFor="hr-gevel">Gevelzijde</label>
              <select id="hr-gevel" style={veld} value={gevelzijde} onChange={e => setGevelzijde(e.target.value)}>
                <option value="">—</option>
                {GEVEL_ZIJDEN.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={label} htmlFor="hr-onderdeel">Onderdeel</label>
                <select id="hr-onderdeel" style={veld} value={onderdeel} onChange={e => setOnderdeel(e.target.value)}>
                  <option value="">—</option>
                  {ONDERDEEL_TYPEN.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={label} htmlFor="hr-element">Elementnr.</label>
                <input id="hr-element" style={veld} value={elementnr} onChange={e => setElementnr(e.target.value)} />
              </div>
            </div>
          </Blok>

          <Blok titel="Schade">
            <div>
              <label style={label} htmlFor="hr-schade">Omschrijving</label>
              <textarea id="hr-schade" style={{ ...veld, minHeight: 80, resize: 'vertical' }} value={schade} onChange={e => setSchade(e.target.value)} />
            </div>
            <div>
              <label style={label} htmlFor="hr-ernst">Ernst</label>
              <select id="hr-ernst" style={veld} value={ernst} onChange={e => setErnst(e.target.value as SchadeSeverity | '')}>
                <option value="">—</option>
                {Object.entries(SCHADE_SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </Blok>

          <Blok titel="Reparatie">
            <div>
              <label style={label} htmlFor="hr-reparatie">Recept</label>
              <select id="hr-reparatie" style={veld} value={reparatieId} onChange={e => setReparatieId(e.target.value)}>
                <option value="">— geen —</option>
                {recepten.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.naam}{r.verkoopprijs ? ` — € ${r.verkoopprijs.toFixed(2)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="hr-notitie">Notitie</label>
              <textarea id="hr-notitie" style={{ ...veld, minHeight: 60, resize: 'vertical' }} value={notitie} onChange={e => setNotitie(e.target.value)} />
            </div>
          </Blok>

          <Blok titel="Foto's">
            <div>
              <label style={label} htmlFor="hr-voor">Voor</label>
              <input id="hr-voor" type="file" accept="image/*" capture="environment" style={{ ...veld, padding: 9 }}
                onChange={e => setVoorFoto(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label style={label} htmlFor="hr-na">Na</label>
              <input id="hr-na" type="file" accept="image/*" capture="environment" style={{ ...veld, padding: 9 }}
                onChange={e => setNaFoto(e.target.files?.[0] ?? null)} />
            </div>
          </Blok>
        </div>

        <MobielStickyFooter>
          <button
            type="button"
            onClick={() => { setInvoeren(false); setFout(null) }}
            disabled={bezig}
            style={{
              padding: '14px 16px', borderRadius: 12, background: '#fff', color: '#6b757c',
              border: '1px solid #e3e8ea', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={opslaan}
            disabled={bezig}
            style={{
              flex: 1, padding: '14px 16px', borderRadius: 12, border: 'none',
              background: bezig ? '#9aa4ab' : '#009439', color: '#fff',
              fontSize: 16, fontWeight: 700, cursor: bezig ? 'default' : 'pointer',
            }}
          >
            {bezig ? 'Opslaan…' : 'Opslaan'}
          </button>
        </MobielStickyFooter>
      </div>
    )
  }

  // ── Lijststand ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {fout && (
          <div style={{ color: '#b42318', fontSize: 14, textAlign: 'center', padding: 24 }}>{fout}</div>
        )}
        {!fout && registraties === null && (
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 24 }}>Laden…</div>
        )}
        {!fout && registraties?.length === 0 && (
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 32 }}>
            Nog geen houtrotregistraties voor dit dossier.
          </div>
        )}
        {registraties?.map(r => {
          const plaats = [r.location_block, r.floor, r.room_or_unit, r.facade_side, r.component_type, r.element_number]
            .filter(Boolean).join(' · ') || 'Plaats niet opgegeven'
          return (
            <div key={r.id} style={{
              padding: '12px 14px', background: '#fff',
              border: '1px solid #e3e8ea', borderRadius: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#161b20', minWidth: 0 }}>{plaats}</div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b757c', flexShrink: 0 }}>
                  {REGISTRATIE_STATUSSEN[r.status] ?? r.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b757c', marginTop: 3 }}>
                {r.registration_date}
                {r.repair_name_snapshot ? ` · ${r.repair_name_snapshot}` : ''}
              </div>
            </div>
          )
        })}
      </div>

      <MobielStickyFooter>
        <button
          type="button"
          onClick={() => setInvoeren(true)}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
            background: '#009439', color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          Nieuwe registratie
        </button>
      </MobielStickyFooter>
    </div>
  )
}
