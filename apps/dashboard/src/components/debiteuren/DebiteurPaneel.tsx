'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter, Button } from '@/components/ui'
import {
  updateDebiteurEnrichment, addDebiteurLogboek, getDebiteurLogboek,
  type DebiteurRij, type Redencode, type MedewerkerOptie, type LogboekRegel, type DebiteurOpvolgstatus,
} from '@/lib/debiteuren/actions'

const OPVOLGSTATUS_LABELS: Record<DebiteurOpvolgstatus, string> = {
  nieuw: 'Nieuw',
  loopt: 'In behandeling',
  wacht_op_klant: 'Wacht op klant',
  opgelost: 'Opgelost',
  geescaleerd: 'Geëscaleerd',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', background: 'white',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
  textTransform: 'uppercase', color: 'var(--fg-muted)', marginBottom: 5,
}

function euro(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

type Props = {
  rij: DebiteurRij | null
  redencodes: Redencode[]
  medewerkers: MedewerkerOptie[]
  magBewerken: boolean
  onClose: () => void
}

export default function DebiteurPaneel({ rij, redencodes, medewerkers, magBewerken, onClose }: Props) {
  const router = useRouter()
  const [redenCodeId, setRedenCodeId] = useState<string>('')
  const [actie, setActie] = useState('')
  const [actiehouderId, setActiehouderId] = useState<string>('')
  const [verwachteBetaaldatum, setVerwachteBetaaldatum] = useState('')
  const [opvolgdatum, setOpvolgdatum] = useState('')
  const [opvolgstatus, setOpvolgstatus] = useState<DebiteurOpvolgstatus>('nieuw')
  const [nieuweOpmerking, setNieuweOpmerking] = useState('')
  const [logboek, setLogboek] = useState<LogboekRegel[]>([])
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    if (!rij) return
    setRedenCodeId(rij.reden_code_id ?? '')
    setActie(rij.actie ?? '')
    setActiehouderId(rij.actiehouder_id ?? '')
    setVerwachteBetaaldatum(rij.verwachte_betaaldatum ?? '')
    setOpvolgdatum(rij.opvolgdatum ?? '')
    setOpvolgstatus(rij.opvolgstatus)
    setNieuweOpmerking('')
    setLogboek([])
    getDebiteurLogboek(rij.id).then(setLogboek).catch(() => {})
  }, [rij])

  const verplicht = (rij?.dagen_na_vervaldatum ?? 0) > 60

  async function opslaan() {
    if (!rij) return
    setBezig(true)
    try {
      const res = await updateDebiteurEnrichment(rij.id, {
        reden_code_id: redenCodeId || null,
        actie: actie.trim() || null,
        actiehouder_id: actiehouderId || null,
        verwachte_betaaldatum: verwachteBetaaldatum || null,
        opvolgdatum: opvolgdatum || null,
        opvolgstatus,
      })
      if (!res.ok) { toast.error(res.error); return }
      if (nieuweOpmerking.trim()) {
        const logRes = await addDebiteurLogboek(rij.id, nieuweOpmerking)
        if (!logRes.ok) { toast.error(logRes.error); return }
      }
      toast.success('Opvolging opgeslagen')
      router.refresh()
      onClose()
    } finally {
      setBezig(false)
    }
  }

  return (
    <Drawer open={!!rij} onOpenChange={open => { if (!open) onClose() }}>
      <DrawerContent width={460}>
        {rij && (
          <>
            <DrawerHeader>
              <DrawerTitle>{rij.factuurnummer ?? 'Factuur'} · {euro(rij.bedrag)}</DrawerTitle>
              <DrawerDescription>{rij.klant_naam ?? '—'} · {rij.project_titel ?? '—'}</DrawerDescription>
            </DrawerHeader>

            <DrawerBody>
              {/* Kerngegevens */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                <Kern label="Vervaldatum" value={datum(rij.vervaldatum)} />
                <Kern label="Dagen te laat" value={rij.dagen_na_vervaldatum != null && rij.dagen_na_vervaldatum > 0 ? `${rij.dagen_na_vervaldatum} dgn` : 'Niet vervallen'} />
                <Kern label="Projectleider" value={rij.projectleider_naam ?? '—'} />
                <Kern label="Factuurdatum" value={datum(rij.factuurdatum)} />
              </div>

              {verplicht && rij.verplicht_incompleet && (
                <div style={{
                  marginBottom: 16, padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                  fontSize: 12, color: '#b91c1c', fontWeight: 600,
                }}>
                  Deze factuur is &gt;60 dagen te laat. Reden, actie, actiehouder, verwachte betaaldatum,
                  opvolgdatum én een opmerking zijn verplicht — de opvolgtaak kan pas worden afgerond als alles ingevuld is.
                </div>
              )}

              {/* Opvolgvelden */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Reden niet betaald {verplicht && <span style={{ color: '#dc2626' }}>*</span>}</label>
                  <select style={inputStyle} value={redenCodeId} disabled={!magBewerken} onChange={e => setRedenCodeId(e.target.value)}>
                    <option value="">— Kies reden —</option>
                    {redencodes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Concrete actie {verplicht && <span style={{ color: '#dc2626' }}>*</span>}</label>
                  <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={actie} disabled={!magBewerken}
                    onChange={e => setActie(e.target.value)} placeholder="Wat is de afgesproken actie?" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Actiehouder {verplicht && <span style={{ color: '#dc2626' }}>*</span>}</label>
                    <select style={inputStyle} value={actiehouderId} disabled={!magBewerken} onChange={e => setActiehouderId(e.target.value)}>
                      <option value="">— Kies —</option>
                      {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Opvolgstatus</label>
                    <select style={inputStyle} value={opvolgstatus} disabled={!magBewerken}
                      onChange={e => setOpvolgstatus(e.target.value as DebiteurOpvolgstatus)}>
                      {(Object.keys(OPVOLGSTATUS_LABELS) as DebiteurOpvolgstatus[]).map(s =>
                        <option key={s} value={s}>{OPVOLGSTATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Verwachte betaaldatum {verplicht && <span style={{ color: '#dc2626' }}>*</span>}</label>
                    <input type="date" style={inputStyle} value={verwachteBetaaldatum} disabled={!magBewerken}
                      onChange={e => setVerwachteBetaaldatum(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Opvolgdatum {verplicht && <span style={{ color: '#dc2626' }}>*</span>}</label>
                    <input type="date" style={inputStyle} value={opvolgdatum} disabled={!magBewerken}
                      onChange={e => setOpvolgdatum(e.target.value)} />
                  </div>
                </div>

                {/* Logboek */}
                <div style={{ marginTop: 6 }}>
                  <label style={labelStyle}>Logboek {verplicht && <span style={{ color: '#dc2626' }}>*</span>}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                    {logboek.length === 0 && <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>Nog geen opmerkingen.</span>}
                    {logboek.map(l => (
                      <div key={l.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'pre-wrap' }}>{l.tekst}</div>
                        <div style={{ fontSize: 10, color: 'var(--fg-soft)', marginTop: 4 }}>
                          {l.auteur ?? 'Onbekend'} · {new Date(l.aangemaakt_op).toLocaleString('nl-NL')}
                        </div>
                      </div>
                    ))}
                  </div>
                  {magBewerken && (
                    <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={nieuweOpmerking}
                      onChange={e => setNieuweOpmerking(e.target.value)} placeholder="Nieuwe opmerking toevoegen…" />
                  )}
                </div>
              </div>
            </DrawerBody>

            <DrawerFooter>
              <Button variant="secondary" onClick={onClose}>Sluiten</Button>
              {magBewerken && (
                <Button variant="primary" onClick={opslaan} disabled={bezig}>
                  {bezig ? 'Opslaan…' : 'Opslaan'}
                </Button>
              )}
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function Kern({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--fg-soft)' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--fg)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
