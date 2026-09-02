'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Card, CardBody, Input } from '@/components/ui'
import {
  setUrenInstellingen,
  setUursoortCategorie,
  setIndirectDossier,
  herlaadUursoorten,
  type UrenCategorie,
} from '@/app/(platform)/instellingen/uren/actions'

type Instellingen = {
  terugval_goedkeurder_id: string | null
  tolerantie_uren: number | string
  indien_deadline_dag: number
  indien_deadline_tijd: string
  goedkeur_deadline_dag: number
  goedkeur_deadline_tijd: string
} | null

type Uursoort = {
  id: string
  naam: string
  code: string
  bouw7_id: string | null
  uren_categorie: UrenCategorie | null
  actief: boolean
}

type Werkmaatschappij = { id: string; naam: string; indirect_uren_dossier_id: string | null }
type Medewerker = { id: string; voornaam: string; tussenvoegsel: string | null; achternaam: string }
type Dossier = { id: string; dossiernummer: string; titel: string }

const DAGEN = [
  [1, 'maandag'], [2, 'dinsdag'], [3, 'woensdag'], [4, 'donderdag'],
  [5, 'vrijdag'], [6, 'zaterdag'], [7, 'zondag'],
] as const

const CATEGORIE_LABEL: Record<UrenCategorie, string> = {
  werk: 'Werk — dossier + bewakingscode verplicht',
  afwezig: 'Afwezig — telt als verantwoord',
  tijd_voor_tijd: 'Tijd voor tijd — verlaagt het saldo',
  feestdag: 'Feestdag — wordt voorgevuld',
}

const veldStijl: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 8px',
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg-elev)', color: 'var(--fg)',
}

const kopStijl: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
  margin: '0 0 4px', color: 'var(--fg)',
}

const uitlegStijl: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px',
}

function volledigeNaam(m: Medewerker) {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

export default function UrenInstellingenBeheer({
  instellingen, uursoorten, werkmaatschappijen, medewerkers, indirectDossiers,
}: {
  instellingen: Instellingen
  uursoorten: Uursoort[]
  werkmaatschappijen: Werkmaatschappij[]
  medewerkers: Medewerker[]
  indirectDossiers: Dossier[]
}) {
  const router = useRouter()
  const [, startT] = useTransition()
  const ververs = () => startT(() => router.refresh())

  const [form, setForm] = useState({
    terugval_goedkeurder_id: instellingen?.terugval_goedkeurder_id ?? '',
    tolerantie_uren: Number(instellingen?.tolerantie_uren ?? 0),
    indien_deadline_dag: instellingen?.indien_deadline_dag ?? 5,
    indien_deadline_tijd: (instellingen?.indien_deadline_tijd ?? '17:00').slice(0, 5),
    goedkeur_deadline_dag: instellingen?.goedkeur_deadline_dag ?? 1,
    goedkeur_deadline_tijd: (instellingen?.goedkeur_deadline_tijd ?? '12:00').slice(0, 5),
  })
  const [busy, setBusy] = useState(false)
  const [herladen, setHerladen] = useState(false)

  async function bewaarInstellingen() {
    setBusy(true)
    const r = await setUrenInstellingen({
      terugval_goedkeurder_id: form.terugval_goedkeurder_id || null,
      tolerantie_uren: form.tolerantie_uren,
      indien_deadline_dag: form.indien_deadline_dag,
      indien_deadline_tijd: `${form.indien_deadline_tijd}:00`,
      goedkeur_deadline_dag: form.goedkeur_deadline_dag,
      goedkeur_deadline_tijd: `${form.goedkeur_deadline_tijd}:00`,
    })
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Instellingen opgeslagen')
    ververs()
  }

  async function wijzigCategorie(id: string, waarde: string) {
    const r = await setUursoortCategorie(id, (waarde || null) as UrenCategorie | null)
    if (!r.ok) { toast.error(r.error); return }
    ververs()
  }

  async function wijzigIndirect(wmId: string, dossierId: string) {
    const r = await setIndirectDossier(wmId, dossierId || null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Opgeslagen')
    ververs()
  }

  async function haalUursoortenOp() {
    setHerladen(true)
    const r = await herlaadUursoorten()
    setHerladen(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(
      r.nieuw > 0
        ? `${r.nieuw} nieuwe uursoort${r.nieuw === 1 ? '' : 'en'} opgehaald — deel ze hieronder nog in.`
        : `Lijst is bij (${r.gevonden} uursoorten).`,
    )
    ververs()
  }

  const ongeclassificeerd = uursoorten.filter(u => u.bouw7_id && !u.uren_categorie).length
  const zonderIndirect = werkmaatschappijen.filter(w => !w.indirect_uren_dossier_id).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Deadlines en goedkeuring ─────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 style={kopStijl}>Deadlines en goedkeuring</h2>
          <p style={uitlegStijl}>
            Na de indien-deadline krijgt wie zijn week nog niet ingediend heeft een herinnering;
            na de goedkeur-deadline geldt dat voor de goedkeurders.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
                Uren indienen vóór
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={form.indien_deadline_dag} style={veldStijl}
                  onChange={e => setForm(f => ({ ...f, indien_deadline_dag: Number(e.target.value) }))}>
                  {DAGEN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                </select>
                <input type="time" value={form.indien_deadline_tijd} style={{ ...veldStijl, width: 100 }}
                  onChange={e => setForm(f => ({ ...f, indien_deadline_tijd: e.target.value }))} />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
                Goedkeuren vóór (week erna)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={form.goedkeur_deadline_dag} style={veldStijl}
                  onChange={e => setForm(f => ({ ...f, goedkeur_deadline_dag: Number(e.target.value) }))}>
                  {DAGEN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                </select>
                <input type="time" value={form.goedkeur_deadline_tijd} style={{ ...veldStijl, width: 100 }}
                  onChange={e => setForm(f => ({ ...f, goedkeur_deadline_tijd: e.target.value }))} />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
                Speling op de contracturen
              </span>
              <div style={{ width: 120 }}>
                <Input type="number" min="0" step="0.25" value={form.tolerantie_uren}
                  onChange={e => setForm(f => ({ ...f, tolerantie_uren: parseFloat(e.target.value) || 0 }))}
                  suffix={<span style={{ fontSize: 10 }}>uur</span>} />
              </div>
            </label>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 420 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
                Terugvalgoedkeurder
              </span>
              <select value={form.terugval_goedkeurder_id} style={veldStijl}
                onChange={e => setForm(f => ({ ...f, terugval_goedkeurder_id: e.target.value }))}>
                <option value="">— niemand —</option>
                {medewerkers.map(m => <option key={m.id} value={m.id}>{volledigeNaam(m)}</option>)}
              </select>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>
                Beoordeelt de weken van medewerkers die geen ploeg — en dus geen teamleider — hebben.
                Zonder terugval kan zo iemand zijn week nergens heen sturen.
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', marginTop: 16 }}>
            <Button variant="primary" size="sm" onClick={bewaarInstellingen} loading={busy}
              disabled={busy} style={{ marginLeft: 'auto' }}>
              Opslaan
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ── Indirecte uren ───────────────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 style={kopStijl}>Dossier voor indirecte uren</h2>
          <p style={uitlegStijl}>
            Bouw7 wil op élke urenregel een project, ook op verlof- en ziekuren. Wijs per
            werkmaatschappij het dossier aan waar die uren op geboekt worden.
            {zonderIndirect > 0 && (
              <strong style={{ color: 'var(--warn-fg, #a15c00)' }}>
                {' '}Nog {zonderIndirect} werkmaatschappij{zonderIndirect === 1 ? '' : 'en'} zonder
                dossier — verlof en ziekte kunnen daar nog niet verstuurd worden.
              </strong>
            )}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {werkmaatschappijen.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, flex: 1, color: 'var(--fg)' }}>
                  {w.naam}
                </span>
                <select value={w.indirect_uren_dossier_id ?? ''} style={{ ...veldStijl, minWidth: 320 }}
                  onChange={e => wijzigIndirect(w.id, e.target.value)}>
                  <option value="">— niet ingesteld —</option>
                  {indirectDossiers.map(d => (
                    <option key={d.id} value={d.id}>{d.dossiernummer} · {d.titel}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ── Uursoorten ───────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <h2 style={kopStijl}>Hoe uursoorten meetellen</h2>
              <p style={uitlegStijl}>
                De uursoorten komen uit Bouw7 en zijn daar leidend. Wat EVA hier vastlegt is hoe elke
                soort in de weekstaat meetelt. Een soort zonder indeling is bewust níét kiesbaar.
                {ongeclassificeerd > 0 && (
                  <strong style={{ color: 'var(--warn-fg, #a15c00)' }}>
                    {' '}{ongeclassificeerd} nog in te delen.
                  </strong>
                )}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={haalUursoortenOp} loading={herladen} disabled={herladen}>
              Ophalen uit Bouw7
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {uursoorten.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                opacity: u.bouw7_id ? 1 : 0.55,
              }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, flex: 1, color: 'var(--fg)' }}>
                  {u.naam}
                  {!u.bouw7_id && (
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}> · alleen in EVA</span>
                  )}
                </span>
                <select
                  value={u.uren_categorie ?? ''}
                  disabled={!u.bouw7_id}
                  style={{ ...veldStijl, minWidth: 300 }}
                  onChange={e => wijzigCategorie(u.id, e.target.value)}
                >
                  <option value="">— niet kiesbaar in de weekstaat —</option>
                  {(Object.keys(CATEGORIE_LABEL) as UrenCategorie[]).map(c => (
                    <option key={c} value={c}>{CATEGORIE_LABEL[c]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
