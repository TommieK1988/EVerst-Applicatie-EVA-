'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { PageHeader, Button } from '@/components/ui'
import Modal, { modalInput, modalLabel } from './Modal'
import { maakTeam, updateTeam, archiveerTeam, updateInstellingen } from '@/app/(platform)/materieelbeheer/beheer-actions'
import {
  TEAM_TYPES, TEAM_TYPE_LABELS, CONTROLE_FREQUENTIES, FREQUENTIE_LABELS,
  type MaterieelTeam, type MaterieelInstellingen, type TeamType, type KeuringSoort,
} from '@/lib/materieel/types'

type Tab = 'teams' | 'controle' | 'keuringen'

export default function InstellingenBeheer({ teams, instellingen }: { teams: MaterieelTeam[]; instellingen: MaterieelInstellingen }) {
  const [tab, setTab] = React.useState<Tab>('teams')

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Materieelbeheer" title="Instellingen" />
      <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
        Beheer hier de zaken die in de tijd wijzigen — teams/servicebussen, keuringsoorten en de controle- en waarschuwingstermijnen. Zo blijft het systeem flexibel zonder codewijziging.
      </p>

      <div style={{ display: 'flex', gap: 2, padding: 4, background: 'var(--bg-subtle)', borderRadius: 10, width: 'fit-content', marginBottom: 16 }}>
        {([['teams', 'Teams & bussen'], ['controle', 'Controle & waarschuwingen'], ['keuringen', 'Keuringsoorten']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === k ? 'var(--bg)' : 'transparent', color: tab === k ? 'var(--fg)' : 'var(--fg-muted)',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'teams' && <TeamsTab teams={teams} />}
      {tab === 'controle' && <ControleTab instellingen={instellingen} />}
      {tab === 'keuringen' && <KeuringenTab instellingen={instellingen} />}
    </div>
  )
}

/* ── Teams ── */

function TeamsTab({ teams }: { teams: MaterieelTeam[] }) {
  const router = useRouter()
  const [modal, setModal] = React.useState<null | { team?: MaterieelTeam }>(null)
  const [bezig, setBezig] = React.useState(false)

  async function verwijder(id: string) {
    if (!confirm('Dit team archiveren?')) return
    const res = await archiveerTeam(id)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Gearchiveerd'); router.refresh()
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Button variant="primary" onClick={() => setModal({})}>+ Nieuw team / bus</Button>
      </div>
      {teams.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Nog geen teams. Voeg servicebussen, keten of ploegen toe om materieel op teamniveau toe te wijzen.</p>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {teams.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{t.naam}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{TEAM_TYPE_LABELS[t.type]}{t.kenteken ? ` · ${t.kenteken}` : ''}{t.omschrijving ? ` · ${t.omschrijving}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="secondary" onClick={() => setModal({ team: t })}>Bewerken</Button>
                <Button variant="secondary" onClick={() => verwijder(t.id)}>Archiveren</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <TeamModal
          team={modal.team} bezig={bezig} onSluit={() => setModal(null)}
          onOpslaan={async (input) => {
            setBezig(true)
            const res = modal.team ? await updateTeam(modal.team.id, input) : await maakTeam(input)
            setBezig(false)
            if (!res.ok) { toast.error(res.error); return }
            toast.success('Opgeslagen'); setModal(null); router.refresh()
          }}
        />
      )}
    </div>
  )
}

function TeamModal({ team, bezig, onSluit, onOpslaan }: {
  team?: MaterieelTeam; bezig: boolean; onSluit: () => void
  onOpslaan: (i: { naam: string; type: TeamType; omschrijving?: string | null; kenteken?: string | null }) => void
}) {
  const [naam, setNaam] = React.useState(team?.naam ?? '')
  const [type, setType] = React.useState<TeamType>(team?.type ?? 'bus')
  const [kenteken, setKenteken] = React.useState(team?.kenteken ?? '')
  const [omschrijving, setOmschrijving] = React.useState(team?.omschrijving ?? '')
  return (
    <Modal titel={team ? 'Team bewerken' : 'Nieuw team / bus'} onSluit={onSluit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={modalLabel}>Naam *</label><input value={naam} onChange={(e) => setNaam(e.target.value)} style={modalInput} placeholder="Bijv. Servicebus 6" /></div>
        <div>
          <label style={modalLabel}>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as TeamType)} style={modalInput}>
            {TEAM_TYPES.map((t) => <option key={t} value={t}>{TEAM_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div><label style={modalLabel}>Kenteken (bij bus)</label><input value={kenteken} onChange={(e) => setKenteken(e.target.value)} style={modalInput} /></div>
        <div><label style={modalLabel}>Omschrijving</label><input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} style={modalInput} /></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="primary" disabled={bezig} onClick={() => onOpslaan({ naam, type, kenteken: kenteken || null, omschrijving: omschrijving || null })}>Opslaan</Button>
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Controle & waarschuwingen ── */

function ControleTab({ instellingen }: { instellingen: MaterieelInstellingen }) {
  const router = useRouter()
  const [freq, setFreq] = React.useState(instellingen.controle_frequentie)
  const [moment, setMoment] = React.useState(instellingen.controle_moment)
  const [keuringDagen, setKeuringDagen] = React.useState(String(instellingen.keuring_waarschuwing_dagen))
  const [apkDagen, setApkDagen] = React.useState(String(instellingen.apk_waarschuwing_dagen))
  const [garantieDagen, setGarantieDagen] = React.useState(String(instellingen.garantie_waarschuwing_dagen))
  const [bezig, setBezig] = React.useState(false)

  async function opslaan() {
    setBezig(true)
    const res = await updateInstellingen({
      controle_frequentie: freq, controle_moment: moment,
      keuring_waarschuwing_dagen: Number(keuringDagen), apk_waarschuwing_dagen: Number(apkDagen),
      garantie_waarschuwing_dagen: Number(garantieDagen), keuring_soorten: instellingen.keuring_soorten,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Opgeslagen'); router.refresh()
  }

  const veld: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }
  return (
    <div style={veld}>
      <div>
        <label style={modalLabel}>Controlefrequentie</label>
        <select value={freq} onChange={(e) => setFreq(e.target.value)} style={modalInput}>
          {CONTROLE_FREQUENTIES.map((f) => <option key={f} value={f}>{FREQUENTIE_LABELS[f]}</option>)}
        </select>
      </div>
      <div>
        <label style={modalLabel}>Controlemoment</label>
        <input value={moment} onChange={(e) => setMoment(e.target.value)} style={modalInput} placeholder="Bijv. eerste maandag van de maand" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div><label style={modalLabel}>Keuring waarsch. (dagen)</label><input type="number" min="0" value={keuringDagen} onChange={(e) => setKeuringDagen(e.target.value)} style={modalInput} /></div>
        <div><label style={modalLabel}>APK waarsch. (dagen)</label><input type="number" min="0" value={apkDagen} onChange={(e) => setApkDagen(e.target.value)} style={modalInput} /></div>
        <div><label style={modalLabel}>Garantie waarsch. (dagen)</label><input type="number" min="0" value={garantieDagen} onChange={(e) => setGarantieDagen(e.target.value)} style={modalInput} /></div>
      </div>
      <div><Button variant="primary" disabled={bezig} onClick={opslaan}>Opslaan</Button></div>
    </div>
  )
}

/* ── Keuringsoorten ── */

function KeuringenTab({ instellingen }: { instellingen: MaterieelInstellingen }) {
  const router = useRouter()
  const [soorten, setSoorten] = React.useState<KeuringSoort[]>(instellingen.keuring_soorten)
  const [nieuw, setNieuw] = React.useState('')
  const [bezig, setBezig] = React.useState(false)

  function voegToe() {
    const label = nieuw.trim()
    if (!label) return
    setSoorten((s) => [...s, { key: label.toLowerCase().replace(/\s+/g, '_'), label }])
    setNieuw('')
  }

  async function opslaan() {
    setBezig(true)
    const res = await updateInstellingen({
      controle_frequentie: instellingen.controle_frequentie, controle_moment: instellingen.controle_moment,
      keuring_waarschuwing_dagen: instellingen.keuring_waarschuwing_dagen, apk_waarschuwing_dagen: instellingen.apk_waarschuwing_dagen,
      garantie_waarschuwing_dagen: instellingen.garantie_waarschuwing_dagen, keuring_soorten: soorten,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Opgeslagen'); router.refresh()
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Deze soorten kun je kiezen bij het toevoegen van een keuring aan materieel (APK, CE, elektra, …).</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {soorten.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--fg)' }}>{s.label}</span>
            <button onClick={() => setSoorten((arr) => arr.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 18 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); voegToe() } }} style={modalInput} placeholder="Nieuwe keuringsoort…" />
        <Button variant="secondary" onClick={voegToe}>Toevoegen</Button>
      </div>
      <div><Button variant="primary" disabled={bezig} onClick={opslaan}>Opslaan</Button></div>
    </div>
  )
}
