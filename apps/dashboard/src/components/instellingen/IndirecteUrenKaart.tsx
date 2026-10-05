'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Card, CardBody, FormField } from '@/components/ui'
import {
  setIndirectDossier,
  setIndirecteAfdelingen,
  setMedewerkerWerkmaatschappij,
  setExternKantoorDossier,
} from '@/app/(platform)/instellingen/uren/actions'

/**
 * Waar uren landen die niemand op een project boekt: per werkmaatschappij één project voor
 * niet-gewerkte uren en één voor gewerkte overhead, welke afdelingen nooit een project kiezen, en
 * wie er nog geen werkmaatschappij heeft. De medewerker ziet deze projecten niet; EVA kiest ze.
 */

export type IndirectWerkmaatschappij = {
  id: string
  naam: string
  indirect_uren_dossier_id: string | null
  indirect_gewerkt_dossier_id: string | null
}
type Dossier = { id: string; dossiernummer: string; titel: string }
export type MedewerkerZonderWm = { id: string; naam: string; afdeling: string | null }

export default function IndirecteUrenKaart({
  werkmaatschappijen, indirectDossiers, afdelingen, indirecteAfdelingen, zonderWerkmaatschappij,
  externKantoorDossierId,
}: {
  werkmaatschappijen: IndirectWerkmaatschappij[]
  externKantoorDossierId: string | null
  indirectDossiers: Dossier[]
  afdelingen: string[]
  indirecteAfdelingen: string[]
  zonderWerkmaatschappij: MedewerkerZonderWm[]
}) {
  const router = useRouter()
  const [, startT] = useTransition()
  const ververs = () => startT(() => router.refresh())

  const [kantoor, setKantoor] = useState<string[]>(indirecteAfdelingen)
  const [kantoorBusy, setKantoorBusy] = useState(false)

  async function wijzigDossier(wmId: string, soort: 'gewerkt' | 'niet_gewerkt', dossierId: string) {
    const r = await setIndirectDossier(wmId, soort, dossierId || null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Opgeslagen')
    ververs()
  }

  async function bewaarKantoor() {
    setKantoorBusy(true)
    const r = await setIndirecteAfdelingen(kantoor)
    setKantoorBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Opgeslagen')
    ververs()
  }

  async function wijzigExternKantoor(dossierId: string) {
    const r = await setExternKantoorDossier(dossierId || null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Opgeslagen')
    ververs()
  }

  async function kiesWerkmaatschappij(mwId: string, wmId: string) {
    if (!wmId) return
    const r = await setMedewerkerWerkmaatschappij(mwId, wmId)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Opgeslagen')
    ververs()
  }

  const dossierOpties = (
    <>
      <option value="">— niet ingesteld —</option>
      {indirectDossiers.map(d => (
        <option key={d.id} value={d.id}>{d.dossiernummer} · {d.titel}</option>
      ))}
    </>
  )

  return (
    <Card>
      <CardBody>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: 'var(--fg)' }}>Projecten voor indirecte uren</h2>
        <p className="mb-4 text-[12px] text-[var(--fg-muted)]">
          Bouw7 wil op élke urenregel een project, ook op verlof. Medewerkers kiezen die projecten
          niet zelf: EVA zet verlof, ziekte en tijd voor tijd op het project voor niet-gewerkte uren
          van hun werkmaatschappij, en het werk van kantoor op het project voor gewerkte uren.
        </p>

        <div className="flex flex-col gap-4">
          {werkmaatschappijen.map(w => (
            <div key={w.id} className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr_1fr] md:items-end">
              <span className="pb-2 text-[12px] font-semibold text-[var(--fg)]">{w.naam}</span>
              <FormField label="Niet-gewerkte uren" upper>
                <select className="eva-input" style={{ width: '100%' }}
                  value={w.indirect_uren_dossier_id ?? ''}
                  onChange={e => wijzigDossier(w.id, 'niet_gewerkt', e.target.value)}>
                  {dossierOpties}
                </select>
              </FormField>
              <FormField label="Gewerkte uren (kantoor)" upper>
                <select className="eva-input" style={{ width: '100%' }}
                  value={w.indirect_gewerkt_dossier_id ?? ''}
                  onChange={e => wijzigDossier(w.id, 'gewerkt', e.target.value)}>
                  {dossierOpties}
                </select>
              </FormField>
            </div>
          ))}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr_1fr] md:items-end">
            <span className="pb-2 text-[12px] font-semibold text-[var(--fg)]">Externen (ZZP)</span>
            <FormField label="Niet-gewerkte uren" upper>
              <span className="pb-2 text-[12px] text-[var(--fg-muted)]">Externen boeken geen verlof</span>
            </FormField>
            <FormField label="Gewerkte uren (kantoor)" upper>
              <select className="eva-input" style={{ width: '100%' }}
                value={externKantoorDossierId ?? ''}
                onChange={e => wijzigExternKantoor(e.target.value)}>
                {dossierOpties}
              </select>
            </FormField>
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <FormField
            label="Afdelingen die nooit een project kiezen"
            upper
            helper="Wie hier op zit, ziet in de app geen projectkeuze: al zijn gewerkte uren gaan op het kantoorproject van zijn werkmaatschappij."
          >
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {afdelingen.map(a => (
                <label key={a} className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--fg)]">
                  <input
                    type="checkbox"
                    checked={kantoor.includes(a)}
                    onChange={e => setKantoor(k => e.target.checked ? [...k, a] : k.filter(x => x !== a))}
                  />
                  {a}
                </label>
              ))}
            </div>
          </FormField>
          <div className="mt-3 flex">
            <Button variant="primary" size="sm" onClick={bewaarKantoor} loading={kantoorBusy}
              disabled={kantoorBusy} style={{ marginLeft: 'auto' }}>
              Opslaan
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Medewerkers zonder werkmaatschappij
          </span>
          {zonderWerkmaatschappij.length === 0 ? (
            <p className="mt-2 text-[12px] text-[var(--fg-muted)]">Iedereen heeft een werkmaatschappij.</p>
          ) : (
            <>
              <p className="mb-3 mt-1 text-[12px] text-[var(--fg-muted)]">
                <strong className="text-[var(--warn-fg,#a15c00)]">
                  {zonderWerkmaatschappij.length} medewerker{zonderWerkmaatschappij.length === 1 ? '' : 's'}
                </strong>{' '}
                kunnen nog geen verlof of overhead boeken: EVA weet niet op welk project die horen.
                Bouw7 legt dit niet vast; wie er verlof boekte is al ingevuld. Externen hebben geen
                werkmaatschappij nodig en staan hier niet.
              </p>
              <div className="flex flex-col gap-2">
                {zonderWerkmaatschappij.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="flex-1 text-[12px] text-[var(--fg)]">
                      {m.naam}
                      {m.afdeling && <span className="text-[var(--fg-muted)]"> · {m.afdeling}</span>}
                    </span>
                    <select className="eva-input" style={{ minWidth: 260 }} defaultValue=""
                      onChange={e => kiesWerkmaatschappij(m.id, e.target.value)}>
                      <option value="">— kies —</option>
                      {werkmaatschappijen.map(w => <option key={w.id} value={w.id}>{w.naam}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
