'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getProjects } from '@/services/houtrotherstel/projects'
import { getStandaardReparaties } from '@/services/houtrotherstel/standaard-reparaties'
import { createRegistratie, uploadPhoto } from '@/services/houtrotherstel/registraties'
import { getCurrentProfile } from '@/services/houtrotherstel/gebruikers'
import {
  GEVEL_ZIJDEN, ONDERDEEL_TYPEN, SCHADE_SEVERITY,
  type ProjectWithStats, type StandardRepair, type RegistratieForm, type SchadeSeverity,
} from '@/lib/houtrotherstel/types'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'

/**
 * Houtrot-registratie invullen op locatie (buitendienst). Eén scherm: plaats,
 * schade, standaard-reparatie en foto's voor/na. Schrijft naar de echte
 * `houtrotherstel`-tabellen; foto's gaan na het opslaan naar de storage-bucket.
 */
const veldStijl: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: '1px solid #e3e8ea', background: '#fff',
  fontSize: 16, // 16px voorkomt inzoomen op iOS
  color: '#161b20', fontFamily: 'inherit',
}
const labelStijl: React.CSSProperties = {
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

export default function MobielHoutrotNieuwPage() {
  const router = useRouter()

  const [projecten, setProjecten] = useState<ProjectWithStats[]>([])
  const [reparaties, setReparaties] = useState<StandardRepair[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const [projectId, setProjectId] = useState('')
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

  useEffect(() => {
    // Voorselectie vanuit ?project= — bewust via window i.p.v. useSearchParams:
    // die hook dwingt een Suspense-boundary af zodra de route statisch wordt
    // geprerenderd, en laat de build anders falen.
    const vanUrl = new URLSearchParams(window.location.search).get('project')
    if (vanUrl) setProjectId(vanUrl)

    Promise.all([getProjects(), getStandaardReparaties()])
      .then(([p, r]) => {
        setProjecten(p)
        setReparaties(r.filter(x => x.active))
      })
      .catch(e => setFout(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [])

  async function opslaan() {
    if (!projectId) { setFout('Kies eerst een project.'); return }
    setBezig(true)
    setFout(null)

    try {
      const profiel = await getCurrentProfile()
      if (!profiel) throw new Error('Geen gebruikersprofiel gevonden.')

      const sr = reparaties.find(r => r.id === reparatieId)

      const form: RegistratieForm = {
        project_id: projectId,
        registration_date: new Date().toISOString().slice(0, 10),
        location_block: blok || undefined,
        floor: verdieping || undefined,
        room_or_unit: ruimte || undefined,
        facade_side: gevelzijde || undefined,
        component_type: onderdeel || undefined,
        element_number: elementnr || undefined,
        damage_description: schade || undefined,
        damage_severity: ernst || undefined,
        standard_repair_id: reparatieId || undefined,
        notes: notitie || undefined,
        status: 'open',
        control_status: 'niet_gecontroleerd',
        ...(sr && {
          repair_code_snapshot: sr.code,
          repair_name_snapshot: sr.name,
          repair_description_snapshot: sr.description ?? undefined,
          labor_hours_snapshot: sr.labor_hours,
          labor_rate_snapshot: sr.labor_rate,
          labor_cost_snapshot: sr.labor_cost,
          material_cost_snapshot: sr.material_cost,
          cost_price_snapshot: sr.cost_price,
          sale_price_snapshot: sr.sale_price,
        }),
      }

      const registratie = await createRegistratie(form, profiel.id)

      // Foto's pas na het aanmaken — ze hangen aan het registratie-id.
      if (voorFoto) await uploadPhoto(registratie.id, voorFoto, 'voor').catch(() => null)
      if (naFoto) await uploadPhoto(registratie.id, naFoto, 'na').catch(() => null)

      router.push('/m/houtrot')
      router.refresh()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Opslaan mislukt')
      setBezig(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <AppHeader title="Nieuwe registratie" sub="Houtrot" backHref="/m/houtrot" />

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {fout && (
          <div style={{ background: '#fdf1f0', border: '1px solid #f0c8c2', color: '#b42318', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            {fout}
          </div>
        )}

        <Blok titel="Project">
          <div>
            <label style={labelStijl} htmlFor="project">Project</label>
            <select id="project" style={veldStijl} value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">— kies een project —</option>
              {projecten.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.city ? ` · ${p.city}` : ''}</option>
              ))}
            </select>
          </div>
        </Blok>

        <Blok titel="Plaats">
          <div>
            <label style={labelStijl} htmlFor="blok">Blok</label>
            <input id="blok" style={veldStijl} value={blok} onChange={e => setBlok(e.target.value)} placeholder="bijv. Blok A" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStijl} htmlFor="verdieping">Verdieping</label>
              <input id="verdieping" style={veldStijl} value={verdieping} onChange={e => setVerdieping(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStijl} htmlFor="ruimte">Ruimte / nr.</label>
              <input id="ruimte" style={veldStijl} value={ruimte} onChange={e => setRuimte(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStijl} htmlFor="gevelzijde">Gevelzijde</label>
            <select id="gevelzijde" style={veldStijl} value={gevelzijde} onChange={e => setGevelzijde(e.target.value)}>
              <option value="">—</option>
              {GEVEL_ZIJDEN.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStijl} htmlFor="onderdeel">Onderdeel</label>
              <select id="onderdeel" style={veldStijl} value={onderdeel} onChange={e => setOnderdeel(e.target.value)}>
                <option value="">—</option>
                {ONDERDEEL_TYPEN.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStijl} htmlFor="elementnr">Elementnr.</label>
              <input id="elementnr" style={veldStijl} value={elementnr} onChange={e => setElementnr(e.target.value)} />
            </div>
          </div>
        </Blok>

        <Blok titel="Schade">
          <div>
            <label style={labelStijl} htmlFor="schade">Omschrijving</label>
            <textarea id="schade" style={{ ...veldStijl, minHeight: 80, resize: 'vertical' }} value={schade} onChange={e => setSchade(e.target.value)} />
          </div>
          <div>
            <label style={labelStijl} htmlFor="ernst">Ernst</label>
            <select id="ernst" style={veldStijl} value={ernst} onChange={e => setErnst(e.target.value as SchadeSeverity | '')}>
              <option value="">—</option>
              {Object.entries(SCHADE_SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </Blok>

        <Blok titel="Reparatie">
          <div>
            <label style={labelStijl} htmlFor="reparatie">Standaard-reparatie</label>
            <select id="reparatie" style={veldStijl} value={reparatieId} onChange={e => setReparatieId(e.target.value)}>
              <option value="">— geen —</option>
              {reparaties.map(r => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStijl} htmlFor="notitie">Notitie</label>
            <textarea id="notitie" style={{ ...veldStijl, minHeight: 60, resize: 'vertical' }} value={notitie} onChange={e => setNotitie(e.target.value)} />
          </div>
        </Blok>

        <Blok titel="Foto's">
          <div>
            <label style={labelStijl} htmlFor="voor">Voor</label>
            <input id="voor" type="file" accept="image/*" capture="environment" style={{ ...veldStijl, padding: 9 }}
              onChange={e => setVoorFoto(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label style={labelStijl} htmlFor="na">Na</label>
            <input id="na" type="file" accept="image/*" capture="environment" style={{ ...veldStijl, padding: 9 }}
              onChange={e => setNaFoto(e.target.files?.[0] ?? null)} />
          </div>
        </Blok>
      </div>

      <MobielStickyFooter>
        <button
          type="button"
          onClick={opslaan}
          disabled={bezig}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
            background: bezig ? '#9aa4ab' : '#009439', color: '#fff',
            fontSize: 16, fontWeight: 700, cursor: bezig ? 'default' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? 'Opslaan…' : 'Registratie opslaan'}
        </button>
      </MobielStickyFooter>
    </div>
  )
}
