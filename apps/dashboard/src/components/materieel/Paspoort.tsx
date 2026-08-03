'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import QRCode from 'react-qr-code'
import toast from 'react-hot-toast'
import { PageHeader, Button, useDialogen } from '@/components/ui'
import StatusBadge from './StatusBadge'
import HistorieTijdlijn from './HistorieTijdlijn'
import BestandenBlok from './BestandenBlok'
import Modal, { modalInput, modalLabel } from './Modal'
import {
  archiveerMaterieelObject, wijsToe, neemTerug, registreerScan,
  voegKeuringToe, verwijderKeuring, voegOnderhoudToe, zetStatus, updateDetails,
} from '@/app/(platform)/materieelbeheer/actions'
import {
  CATEGORIE_LABELS, NIVEAU_LABELS, MATERIEEL_STATUSSEN, STATUS_META,
  CATEGORIE_DETAILS, ACCU_DETAILS, scanUrl, isAlgemeenGebruik,
  KEURING_UITKOMSTEN, UITKOMST_META,
  type MaterieelObject, type MaterieelKeuring, type MaterieelOnderhoud,
  type ToewijzingNiveau, type Optie, type KeuringSoort, type MaterieelStatus, type DetailVeld,
  type HistorieItem, type KeuringUitkomst, type MaterieelDocumentRij,
} from '@/lib/materieel/types'

function euro(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v)
}
function datum(v: string | null): string {
  return v ? new Date(v).toLocaleDateString('nl-NL') : '—'
}
function dagenTot(v: string | null): number | null {
  if (!v) return null
  const ms = new Date(v).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

const kop: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 6 }

function Rij({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, textAlign: 'right' }}>{waarde}</span>
    </div>
  )
}

type ScanRij = { id: string; gescand_at: string; locatie: string | null; door_naam: string | null }

type Props = {
  object: MaterieelObject
  toegewezenNaam: string | null
  medewerkerOpties: Optie[]
  teamOpties: Optie[]
  keuringen: MaterieelKeuring[]
  onderhoud: MaterieelOnderhoud[]
  scans: ScanRij[]
  keuringSoorten: KeuringSoort[]
  historie: HistorieItem[]
  documenten: MaterieelDocumentRij[]
  /** Signed URL van de hoofdfoto (bucket is privé). */
  hoofdfotoUrl: string | null
}

export default function Paspoort({
  object, toegewezenNaam, medewerkerOpties, teamOpties, keuringen, onderhoud, scans, keuringSoorten, historie,
  documenten, hoofdfotoUrl,
}: Props) {
  const router = useRouter()
  const [origin, setOrigin] = React.useState('')
  React.useEffect(() => { setOrigin(window.location.origin) }, [])

  const [modal, setModal] = React.useState<null | 'toewijzen' | 'keuring' | 'onderhoud' | 'status' | 'details'>(null)
  const [bezig, setBezig] = React.useState(false)
  const { bevestig } = useDialogen()

  const qrValue = scanUrl(object.id, origin || undefined)
  const niveau = object.toewijzing_niveau as ToewijzingNiveau | null
  // Geen medewerker én geen team gekoppeld = algemeen gebruik (geen aparte
  // "niet toegewezen"-toestand).
  const algemeen = isAlgemeenGebruik(object)
  const laatsteGebruiker = scans[0]?.door_naam ?? null

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, succes: string) {
    setBezig(true)
    const res = await fn()
    setBezig(false)
    if (!res.ok) { toast.error(res.error ?? 'Er ging iets mis'); return false }
    toast.success(succes)
    setModal(null)
    router.refresh()
    return true
  }

  const detailVelden: DetailVeld[] = [...(CATEGORIE_DETAILS[object.categorie] ?? []), ...ACCU_DETAILS]
  const gevuldeDetails = detailVelden.filter((v) => object.details?.[v.key] !== undefined && object.details?.[v.key] !== '' && object.details?.[v.key] !== null)

  return (
    <div className="eva-page-full">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link href="/materieelbeheer" style={{ fontSize: 12, color: 'var(--fg-muted)', textDecoration: 'none' }}>← Terug naar overzicht</Link>
          <PageHeader eyebrow={CATEGORIE_LABELS[object.categorie]} title={object.omschrijving} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }} className="materieel-acties">
          {algemeen
            ? <Button variant="primary" onClick={() => setModal('toewijzen')}>Toewijzen</Button>
            : <Button variant="secondary" disabled={bezig} onClick={() => run(() => neemTerug(object.id), 'Ingenomen — staat nu op algemeen gebruik')}>Innemen</Button>}
          <Button variant="secondary" onClick={() => setModal('status')}>Status</Button>
          <Link href={`/materieelbeheer/${object.id}/bewerken`}><Button variant="secondary">Bewerken</Button></Link>
          <Button variant="secondary" disabled={bezig} onClick={async () => {
            if (!await bevestig({ titel: 'Dit materieel archiveren?', bevestigLabel: 'Archiveren' })) return
            const ok = await run(() => archiveerMaterieelObject(object.id), 'Gearchiveerd')
            if (ok) router.push('/materieelbeheer')
          }}>Archiveren</Button>
        </div>
      </div>

      <div className="materieel-paspoort-grid" style={{ display: 'grid', gap: 20, marginTop: 16, alignItems: 'start' }}>
        {/* ── Linkerkolom ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 96, height: 96, borderRadius: 12, flexShrink: 0, overflow: 'hidden', background: 'var(--bg-subtle)', display: 'grid', placeItems: 'center', fontSize: 40 }}>
              {hoofdfotoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={hoofdfotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '📦'}
            </div>
            <div>
              <StatusBadge status={object.status} />
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-soft)' }}>
                {algemeen
                  ? <>
                      <strong style={{ color: 'var(--fg)' }}>Algemeen gebruik</strong>
                      {laatsteGebruiker && <> · laatst gebruikt door <strong style={{ color: 'var(--fg)' }}>{laatsteGebruiker}</strong></>}
                    </>
                  : <>Toegewezen aan <strong style={{ color: 'var(--fg)' }}>{toegewezenNaam}</strong>{niveau && niveau !== 'algemeen' && ` · ${NIVEAU_LABELS[niveau]}`}</>}
              </div>
            </div>
          </div>

          <section>
            <h3 style={kop}>Identificatie</h3>
            <Rij label="Inventarisnummer" waarde={object.inventarisnummer ?? '—'} />
            <Rij label="Merk / Type" waarde={[object.merk, object.type].filter(Boolean).join(' · ') || '—'} />
            <Rij label="Serienummer" waarde={object.serienummer ?? '—'} />
            <Rij label="Categorie" waarde={CATEGORIE_LABELS[object.categorie]} />
          </section>

          <section>
            <h3 style={kop}>Aanschaf &amp; waarde</h3>
            <Rij label="Aankoopdatum" waarde={datum(object.aankoopdatum)} />
            <Rij label="Leverancier" waarde={object.leverancier ?? '—'} />
            <Rij label="Garantie tot" waarde={<GarantieWaarde datum={object.garantie_tot} />} />
            <Rij label="Aanschafwaarde" waarde={euro(object.aanschafwaarde)} />
            <Rij label="Boekwaarde" waarde={euro(object.boekwaarde)} />
          </section>

          {/* Categorie-specifieke velden */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={kop}>Specificaties</h3>
              <button onClick={() => setModal('details')} style={linkKnop}>Bewerken</button>
            </div>
            {gevuldeDetails.length === 0
              ? <p style={leegTekst}>Nog geen specificaties ingevuld.</p>
              : gevuldeDetails.map((v) => <Rij key={v.key} label={v.label} waarde={String(object.details[v.key])} />)}
          </section>

          {/* Keuringen */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={kop}>Keuringen &amp; certificaten</h3>
              <button onClick={() => setModal('keuring')} style={linkKnop}>+ Keuring</button>
            </div>
            {keuringen.length === 0
              ? <p style={leegTekst}>Nog geen keuringen vastgelegd.</p>
              : keuringen.map((k) => {
                  const dagen = dagenTot(k.geldig_tot)
                  const kleur = dagen === null ? 'var(--fg-muted)' : dagen < 0 ? '#dc2626' : dagen <= 30 ? '#f97316' : '#16a34a'
                  const uit = k.uitkomst ? UITKOMST_META[k.uitkomst] : null
                  return (
                    <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{k.soort}</span>
                          {uit && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: uit.kleur,
                              background: `color-mix(in srgb, ${uit.kleur} 12%, transparent)`,
                              padding: '1px 7px', borderRadius: 999,
                            }}>{uit.label}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                          Geldig t/m {datum(k.geldig_tot)}{k.uitgevoerd_door ? ` · door ${k.uitgevoerd_door}` : ''}
                        </div>
                        {k.bevindingen && (
                          <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginTop: 3 }}>
                            <strong style={{ color: 'var(--fg)' }}>Bijzonderheden:</strong> {k.bevindingen}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: kleur, whiteSpace: 'nowrap' }}>
                          {dagen === null ? '—' : dagen < 0 ? `${Math.abs(dagen)}d verlopen` : `nog ${dagen}d`}
                        </span>
                        <button onClick={() => run(() => verwijderKeuring(k.id, object.id), 'Keuring verwijderd')} style={{ ...linkKnop, color: 'var(--fg-muted)' }}>×</button>
                      </div>
                    </div>
                  )
                })}
          </section>

          {/* Onderhoud / storingen */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={kop}>Onderhoud &amp; storingen</h3>
              <button onClick={() => setModal('onderhoud')} style={linkKnop}>+ Registratie</button>
            </div>
            {onderhoud.length === 0
              ? <p style={leegTekst}>Nog geen onderhoud of storingen geregistreerd.</p>
              : onderhoud.map((o) => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', textTransform: 'capitalize' }}>{o.type}{o.omschrijving ? `: ${o.omschrijving}` : ''}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{datum(o.datum)} · {o.status}</div>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--fg-soft)', whiteSpace: 'nowrap' }}>{euro(o.kosten)}</span>
                  </div>
                ))}
          </section>

          {object.opmerkingen && (
            <section>
              <h3 style={kop}>Opmerkingen</h3>
              <p style={{ fontSize: 13, color: 'var(--fg-soft)', whiteSpace: 'pre-wrap' }}>{object.opmerkingen}</p>
            </section>
          )}

          {/* Foto's, handleiding, CE- en keuringsdocumenten */}
          <BestandenBlok objectId={object.id} documenten={documenten} />

          {/* Volledige historie: overdrachten, keuringen, onderhoud, controles, status, scans */}
          <section>
            <h3 style={kop}>Historie</h3>
            <HistorieTijdlijn items={historie} />
          </section>
        </div>

        {/* ── Rechterkolom: QR + scan ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'var(--bg-elev, var(--bg))' }} className="materieel-qr-kaart">
            <div style={{ background: 'white', padding: 12, borderRadius: 8 }}>
              <QRCode value={qrValue} size={150} style={{ height: 150, width: 150 }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{object.omschrijving}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{object.inventarisnummer ?? object.id.slice(0, 8)}</div>
            </div>
            <Button variant="secondary" onClick={() => window.print()} className="materieel-print-verbergen">Sticker printen</Button>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--bg-elev, var(--bg))' }} className="materieel-print-verbergen">
            <h3 style={kop}>Ik pak dit materieel</h3>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>Registreer een scan zodat de laatste gebruiker/locatie bekend is.</p>
            <Button variant="primary" disabled={bezig} onClick={() => run(() => registreerScan(object.id), 'Scan geregistreerd')} style={{ width: '100%' }}>Scan registreren</Button>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === 'toewijzen' && (
        <ToewijzenModal
          medewerkerOpties={medewerkerOpties} teamOpties={teamOpties} bezig={bezig}
          onSluit={() => setModal(null)}
          onOpslaan={(input) => run(() => wijsToe(object.id, input), 'Toegewezen')}
        />
      )}
      {modal === 'keuring' && (
        <KeuringModal
          soorten={keuringSoorten} bezig={bezig} onSluit={() => setModal(null)}
          onOpslaan={(input) => run(() => voegKeuringToe(object.id, input), 'Keuring toegevoegd')}
        />
      )}
      {modal === 'onderhoud' && (
        <OnderhoudModal bezig={bezig} onSluit={() => setModal(null)}
          onOpslaan={(input) => run(() => voegOnderhoudToe(object.id, input), 'Registratie toegevoegd')} />
      )}
      {modal === 'status' && (
        <StatusModal huidige={object.status} bezig={bezig} onSluit={() => setModal(null)}
          onOpslaan={(s) => run(() => zetStatus(object.id, s), 'Status bijgewerkt')} />
      )}
      {modal === 'details' && (
        <DetailsModal velden={detailVelden} huidige={object.details} bezig={bezig} onSluit={() => setModal(null)}
          onOpslaan={(d) => run(() => updateDetails(object.id, d), 'Specificaties opgeslagen')} />
      )}

      <style>{`
        /* Desktop: gegevens + QR naast elkaar. Tablet/telefoon: onder elkaar,
           met de QR-kaart bovenaan (dat is waar je na een scan op landt). */
        .materieel-paspoort-grid { grid-template-columns: minmax(0, 1fr) 280px; }
        @media (max-width: 900px) {
          .materieel-paspoort-grid { grid-template-columns: 1fr; }
          .materieel-paspoort-grid > :last-child { order: -1; }
        }
        /* Ruimere raakvlakken op touch. */
        @media (max-width: 640px) {
          .materieel-acties { width: 100%; }
          .materieel-acties > * { flex: 1 1 auto; }
        }
        @media print {
          body * { visibility: hidden; }
          .materieel-qr-kaart, .materieel-qr-kaart * { visibility: visible; }
          .materieel-qr-kaart { position: fixed; top: 20px; left: 20px; border: none; }
          .materieel-print-verbergen { display: none; }
        }
      `}</style>
    </div>
  )
}

/* ── Kleine helpers ── */

const linkKnop: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--brand-700, var(--accent))', fontSize: 12, fontWeight: 600 }
const leegTekst: React.CSSProperties = { fontSize: 13, color: 'var(--fg-muted)', padding: '6px 0' }

function GarantieWaarde({ datum: d }: { datum: string | null }) {
  if (!d) return <>—</>
  const dagen = dagenTot(d)
  const kleur = dagen !== null && dagen < 0 ? '#dc2626' : dagen !== null && dagen <= 30 ? '#f97316' : 'var(--fg)'
  return <span style={{ color: kleur }}>{datum(d)}{dagen !== null && dagen < 0 ? ' (verlopen)' : ''}</span>
}

/* ── Modals ── */

function ToewijzenModal({ medewerkerOpties, teamOpties, bezig, onSluit, onOpslaan }: {
  medewerkerOpties: Optie[]; teamOpties: Optie[]; bezig: boolean; onSluit: () => void
  onOpslaan: (i: { niveau: ToewijzingNiveau; medewerker_id?: string | null; team_id?: string | null; opmerking?: string | null }) => void
}) {
  const [niveau, setNiveau] = React.useState<ToewijzingNiveau>('persoonlijk')
  const [medewerkerId, setMedewerkerId] = React.useState('')
  const [teamId, setTeamId] = React.useState('')
  const [opmerking, setOpmerking] = React.useState('')

  return (
    <Modal titel="Materieel toewijzen" onSluit={onSluit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={modalLabel}>Niveau</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['persoonlijk', 'team', 'algemeen'] as ToewijzingNiveau[]).map((n) => (
              <button key={n} onClick={() => setNiveau(n)} type="button" style={{
                flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: `1px solid ${niveau === n ? 'var(--brand-500, var(--accent))' : 'var(--border)'}`,
                background: niveau === n ? 'var(--brand-50, var(--bg-subtle))' : 'var(--bg)',
                color: niveau === n ? 'var(--brand-700, var(--accent))' : 'var(--fg-soft)',
              }}>{NIVEAU_LABELS[n]}</button>
            ))}
          </div>
        </div>

        {niveau === 'persoonlijk' && (
          <div>
            <label style={modalLabel}>Medewerker</label>
            <select value={medewerkerId} onChange={(e) => setMedewerkerId(e.target.value)} style={modalInput}>
              <option value="">— Kies medewerker —</option>
              {medewerkerOpties.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
            </select>
          </div>
        )}
        {niveau === 'team' && (
          <div>
            <label style={modalLabel}>Team</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={modalInput}>
              <option value="">— Kies team —</option>
              {teamOpties.map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}
            </select>
            {teamOpties.length === 0 && <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>Nog geen teams — maak ze aan bij Instellingen.</p>}
          </div>
        )}

        <div>
          <label style={modalLabel}>Opmerking (optioneel)</label>
          <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} style={modalInput} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="primary" disabled={bezig} onClick={() => onOpslaan({ niveau, medewerker_id: medewerkerId || null, team_id: teamId || null, opmerking: opmerking || null })}>Toewijzen</Button>
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}

function KeuringModal({ soorten, bezig, onSluit, onOpslaan }: {
  soorten: KeuringSoort[]; bezig: boolean; onSluit: () => void
  onOpslaan: (i: {
    soort: string; geldig_van?: string | null; geldig_tot?: string | null; opmerking?: string | null
    uitkomst?: KeuringUitkomst | null; bevindingen?: string | null; uitgevoerd_door?: string | null
  }) => void
}) {
  const [soort, setSoort] = React.useState(soorten[0]?.label ?? '')
  const [uitkomst, setUitkomst] = React.useState<KeuringUitkomst>('goedgekeurd')
  const [van, setVan] = React.useState('')
  const [tot, setTot] = React.useState('')
  const [bevindingen, setBevindingen] = React.useState('')
  const [keurder, setKeurder] = React.useState('')
  const [opmerking, setOpmerking] = React.useState('')
  return (
    <Modal titel="Keuring vastleggen" onSluit={onSluit} breedte={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={modalLabel}>Soort</label>
          <select value={soort} onChange={(e) => setSoort(e.target.value)} style={modalInput}>
            {soorten.map((s) => <option key={s.key} value={s.label}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label style={modalLabel}>Uitkomst</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {KEURING_UITKOMSTEN.map((u) => {
              const meta = UITKOMST_META[u]
              const actief = uitkomst === u
              return (
                <button key={u} type="button" onClick={() => setUitkomst(u)} style={{
                  flex: '1 1 auto', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  border: `1px solid ${actief ? meta.kleur : 'var(--border)'}`,
                  background: actief ? `color-mix(in srgb, ${meta.kleur} 12%, transparent)` : 'var(--bg)',
                  color: actief ? meta.kleur : 'var(--fg-soft)',
                }}>{meta.label}</button>
              )
            })}
          </div>
          {uitkomst === 'afgekeurd' && (
            <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
              Bij afkeuring zetten we de status automatisch op <strong>Defect</strong> — afgekeurd materieel hoort niet in gebruik te zijn.
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={modalLabel}>Gekeurd op</label><input type="date" value={van} onChange={(e) => setVan(e.target.value)} style={modalInput} /></div>
          <div><label style={modalLabel}>Geldig tot</label><input type="date" value={tot} onChange={(e) => setTot(e.target.value)} style={modalInput} /></div>
        </div>

        <div>
          <label style={modalLabel}>Bijzonderheden</label>
          <textarea value={bevindingen} onChange={(e) => setBevindingen(e.target.value)}
            style={{ ...modalInput, minHeight: 64, resize: 'vertical' }}
            placeholder="Bijv. snoer beschadigd, aardlekschakelaar vervangen, scheur in behuizing…" />
        </div>

        <div><label style={modalLabel}>Gekeurd door (partij/persoon)</label><input value={keurder} onChange={(e) => setKeurder(e.target.value)} style={modalInput} placeholder="Bijv. Keuringsbedrijf X" /></div>
        <div><label style={modalLabel}>Opmerking</label><input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} style={modalInput} /></div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="primary" disabled={bezig} onClick={() => onOpslaan({
            soort, uitkomst, geldig_van: van || null, geldig_tot: tot || null,
            bevindingen: bevindingen || null, uitgevoerd_door: keurder || null, opmerking: opmerking || null,
          })}>Vastleggen</Button>
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}

function OnderhoudModal({ bezig, onSluit, onOpslaan }: {
  bezig: boolean; onSluit: () => void
  onOpslaan: (i: { type: string; omschrijving?: string | null; datum?: string | null; kosten?: number | null; status?: string }) => void
}) {
  const [type, setType] = React.useState('onderhoud')
  const [omschrijving, setOmschrijving] = React.useState('')
  const [datum, setDatum] = React.useState('')
  const [kosten, setKosten] = React.useState('')
  const [status, setStatus] = React.useState('afgerond')
  return (
    <Modal titel="Onderhoud / storing registreren" onSluit={onSluit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={modalLabel}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={modalInput}>
              <option value="onderhoud">Onderhoud</option>
              <option value="reparatie">Reparatie</option>
              <option value="storing">Storing</option>
            </select>
          </div>
          <div>
            <label style={modalLabel}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={modalInput}>
              <option value="afgerond">Afgerond</option>
              <option value="open">Open</option>
            </select>
          </div>
        </div>
        <div><label style={modalLabel}>Omschrijving</label><input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} style={modalInput} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={modalLabel}>Datum</label><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={modalInput} /></div>
          <div><label style={modalLabel}>Kosten (€)</label><input type="number" step="0.01" min="0" value={kosten} onChange={(e) => setKosten(e.target.value)} style={modalInput} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="primary" disabled={bezig} onClick={() => onOpslaan({ type, omschrijving: omschrijving || null, datum: datum || null, kosten: kosten === '' ? null : Number(kosten), status })}>Toevoegen</Button>
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}

function StatusModal({ huidige, bezig, onSluit, onOpslaan }: {
  huidige: MaterieelStatus; bezig: boolean; onSluit: () => void; onOpslaan: (s: MaterieelStatus) => void
}) {
  const [status, setStatus] = React.useState<MaterieelStatus>(huidige)
  return (
    <Modal titel="Status wijzigen" onSluit={onSluit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MATERIEEL_STATUSSEN.map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${status === s ? STATUS_META[s].kleur : 'var(--border)'}`,
            background: status === s ? `color-mix(in srgb, ${STATUS_META[s].kleur} 10%, transparent)` : 'var(--bg)',
            fontSize: 13, fontWeight: 600, color: 'var(--fg)', textAlign: 'left',
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_META[s].kleur }} />
            {STATUS_META[s].label}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button variant="primary" disabled={bezig} onClick={() => onOpslaan(status)}>Opslaan</Button>
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}

function DetailsModal({ velden, huidige, bezig, onSluit, onOpslaan }: {
  velden: DetailVeld[]; huidige: Record<string, unknown>; bezig: boolean; onSluit: () => void
  onOpslaan: (d: Record<string, unknown>) => void
}) {
  const [waarden, setWaarden] = React.useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    velden.forEach((v) => { const w = huidige?.[v.key]; init[v.key] = w === undefined || w === null ? '' : String(w) })
    return init
  })

  function opslaan() {
    const out: Record<string, unknown> = { ...huidige }
    velden.forEach((v) => {
      const raw = waarden[v.key]
      if (raw === '') { delete out[v.key]; return }
      out[v.key] = v.type === 'nummer' ? Number(raw) : v.type === 'ja_nee' ? raw === 'ja' : raw
    })
    onOpslaan(out)
  }

  return (
    <Modal titel="Specificaties bewerken" onSluit={onSluit} breedte={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {velden.map((v) => (
          <div key={v.key}>
            <label style={modalLabel}>{v.label}</label>
            {v.type === 'ja_nee' ? (
              <select value={waarden[v.key]} onChange={(e) => setWaarden((w) => ({ ...w, [v.key]: e.target.value }))} style={modalInput}>
                <option value="">—</option><option value="ja">Ja</option><option value="nee">Nee</option>
              </select>
            ) : (
              <input type={v.type === 'nummer' ? 'number' : v.type === 'datum' ? 'date' : 'text'}
                value={waarden[v.key]} onChange={(e) => setWaarden((w) => ({ ...w, [v.key]: e.target.value }))} style={modalInput} />
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="primary" disabled={bezig} onClick={opslaan}>Opslaan</Button>
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}
