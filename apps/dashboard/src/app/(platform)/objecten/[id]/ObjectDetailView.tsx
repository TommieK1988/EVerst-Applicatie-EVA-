'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { VastgoedObject, VastgoedObjectRol } from '@everts/database'
import { VASTGOED_OBJECT_SOORTEN, VASTGOED_OBJECT_ROLLEN } from '@everts/database'
import { PageHeader, Button, Badge, StatCard, Alert } from '@/components/ui'
import { dossierHref } from '@/lib/dossiers/href'
import { objectAdresRegel } from '@/lib/objecten/adres'
import { bouw7StatusLabel } from '@/lib/objecten/types'
import type { ObjectDossier, ObjectRelatieRij, ObjectTotalen } from '@/lib/objecten/data'
import type { RelatieOptie } from '@/components/objecten/ObjectForm'
import ObjectFormClient from '../ObjectFormClient'
import { koppelRelatieAanObject, ontkoppelRelatieVanObject, ontkoppelDossierVanObject, neemObjectadresOver } from '../actions'

const euro = (n: number) =>
  n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const blok: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
}
const kopje: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
  color: 'var(--fg-muted)', marginBottom: 14,
}

const FASE_LABEL: Record<string, string> = {
  aanvraag: 'Aanvraag', offerte: 'Offerte', opdracht: 'Opdracht',
  servicedesk: 'Servicedesk', afgesloten: 'Afgesloten',
}

type Props = {
  object: VastgoedObject
  dossiers: ObjectDossier[]
  totalen: ObjectTotalen
  objectRelaties: ObjectRelatieRij[]
  relaties: RelatieOptie[]
  magSchrijven: boolean
}

export default function ObjectDetailView({
  object, dossiers, totalen, objectRelaties, relaties, magSchrijven,
}: Props) {
  const router = useRouter()
  const [bewerken, setBewerken] = useState(false)
  const [bezig, start] = useTransition()
  const [nieuweRelatie, setNieuweRelatie] = useState('')
  const [nieuweRol, setNieuweRol] = useState<VastgoedObjectRol>('beheerder')

  const soort = VASTGOED_OBJECT_SOORTEN.find(s => s.key === object.soort)?.label ?? object.soort
  const bouw7 = bouw7StatusLabel(object)
  const afwijkend = dossiers.filter(d => d.adres_wijkt_af).length

  const opdrachten = totalen.aantalPerFase.opdracht + totalen.aantalPerFase.afgesloten
  const voorbehouden: string[] = []
  if (totalen.servicedeskDossiers > 0) {
    voorbehouden.push(
      `${totalen.servicedeskDossiers} van de ${totalen.aantalDossiers} dossiers zijn servicedeskwerk. ` +
      'Dat wordt op regie afgerekend en heeft geen aanneemsom, dus die omzet zit niet in de bedragen hierboven.',
    )
  } else if (totalen.zonderBedrag > 0) {
    voorbehouden.push(
      `${totalen.zonderBedrag} uitgevoerde ${totalen.zonderBedrag === 1 ? 'dossier heeft' : 'dossiers hebben'} ` +
      'geen vastgelegd bedrag, dus de bedragen hierboven dekken niet al het werk.',
    )
  }
  if (totalen.zonderKostprijs > 0 && opdrachten > 0) {
    voorbehouden.push(
      totalen.zonderKostprijs >= opdrachten
        ? 'Van geen enkele opdracht is een kostprijs bekend, dus er valt geen marge te berekenen. Een kostprijs ontstaat pas als de offerte via de calculatiemodule is opgebouwd.'
        : `Van ${totalen.zonderKostprijs} van de ${opdrachten} opdrachten is geen kostprijs bekend. De marge hierboven is daardoor te rooskleurig.`,
    )
  }

  function doe(actie: () => Promise<{ ok: true } | { ok: false; fout: string }>, gelukt: string) {
    start(async () => {
      const res = await actie()
      if (!res.ok) { toast.error(res.fout); return }
      toast.success(gelukt)
      router.refresh()
    })
  }

  if (bewerken) {
    return (
      <div className="eva-page">
        <PageHeader eyebrow="Beheer" title={['Objecten', object.naam, 'Bewerken']} />
        <div style={{ marginBottom: 12 }}>
          <Button variant="secondary" onClick={() => setBewerken(false)}>Terug naar overzicht</Button>
        </div>
        <ObjectFormClient object={object} relaties={relaties} />
      </div>
    )
  }

  return (
    <div className="eva-page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <PageHeader eyebrow="Beheer" title={['Objecten', object.naam]} />
        {magSchrijven && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setBewerken(true)}>Bewerken</Button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <Badge tone="neutral">{soort}</Badge>
        <Badge tone="neutral">{object.objectnummer}</Badge>
        {object.vve_code && <Badge tone="neutral">VvE {object.vve_code}</Badge>}
        <Badge tone={bouw7.toon === 'ok' ? 'success' : bouw7.toon === 'fout' ? 'error' : 'warning'}>{bouw7.label}</Badge>
        {!object.actief && <Badge tone="neutral">Inactief</Badge>}
      </div>

      {object.bouw7_sync_status === 'error' && object.bouw7_sync_fout && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="error">Bouw7 gaf een fout bij dit object: {object.bouw7_sync_fout}</Alert>
        </div>
      )}
      {object.bouw7_sync_status === 'pending' && object.bouw7_sync_fout && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="warning">Nog niet doorgezet naar Bouw7. {object.bouw7_sync_fout}</Alert>
        </div>
      )}

      {/* ── Totalen ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        <StatCard label="Dossiers" value={totalen.aantalDossiers} tone="brand" />
        <StatCard label="Aanneemsom" value={euro(totalen.aanneemsom)} />
        <StatCard
          label={totalen.meerwerkBenadering ? 'Goedgekeurd meerwerk (bij benadering)' : 'Goedgekeurd meerwerk'}
          value={`${totalen.meerwerkBenadering ? '≈ ' : ''}${euro(totalen.goedgekeurdMeerwerk)}`}
        />
        <StatCard
          label="Contracttotaal"
          value={`${totalen.meerwerkBenadering ? '≈ ' : ''}${euro(totalen.contractTotaal)}`}
          tone="success"
        />
        <StatCard
          label={totalen.marge == null ? 'Marge (geen kostprijs bekend)' : 'Marge'}
          value={totalen.marge == null ? '—' : euro(totalen.marge)}
          unit={totalen.margePct != null ? `${totalen.margePct.toFixed(1)}%` : undefined}
          tone={totalen.marge == null ? undefined : totalen.marge >= 0 ? 'success' : 'error'}
        />
        <StatCard label="Open offertes" value={euro(totalen.openOffertes)} tone="info" />
      </div>

      {/* Voorbehouden bij de cijfers. Zonder deze uitleg leest een object met tientallen
          afgehandelde servicedeskklussen als "€ 0 omzet", en een half ingevulde kostprijs
          als een echte marge. Beide getallen worden gebruikt om beslissingen op te nemen. */}
      {voorbehouden.length > 0 && (
        <div style={{ marginTop: -12, marginBottom: 24 }}>
          <Alert tone="info">
            {voorbehouden.length === 1 ? voorbehouden[0] : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {voorbehouden.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            )}
          </Alert>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* ── Gekoppelde dossiers ───────────────────────────────────────── */}
        <div style={blok}>
          <div style={{ ...kopje, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Gekoppelde dossiers ({dossiers.length})</span>
            <span style={{ fontWeight: 400, fontSize: 12 }}>Laatste activiteit: {datum(totalen.laatsteActiviteit)}</span>
          </div>

          {afwijkend > 0 && (
            <div style={{ marginBottom: 14 }}>
              <Alert tone="warning">
                Bij {afwijkend} {afwijkend === 1 ? 'dossier' : 'dossiers'} wijkt het werkadres af van dit object.
                Meestal is het adres in Bouw7 aangepast; de sync overschrijft dat werkadres bij elke run.
              </Alert>
            </div>
          )}

          {dossiers.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              Nog geen dossiers gekoppeld. Koppelen kan op het dossier zelf, bij het werkadres,
              of gebeurt automatisch als het project in Bouw7 aan dit object hangt.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 2 }}>
              {dossiers.map(d => (
                <div
                  key={d.id}
                  style={{
                    display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12,
                    alignItems: 'center', padding: '10px 8px', borderRadius: 8,
                    borderBottom: '1px solid var(--border-subtle, var(--border))',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={dossierHref(d.id, d.hoofdstatus)}
                      style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' }}
                    >
                      {d.dossiernummer ? `${d.dossiernummer} · ` : ''}{d.titel}
                    </Link>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                      {FASE_LABEL[d.fase] ?? d.fase}
                      {d.klant_naam ? ` · ${d.klant_naam}` : ''}
                      {d.werkadres_straat ? ` · ${d.werkadres_straat}` : ''}
                    </div>
                    {d.adres_wijkt_af && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                        <Badge tone="warning">Adres wijkt af</Badge>
                        {magSchrijven && (
                          <button
                            onClick={() => doe(() => neemObjectadresOver(d.id, object.id), 'Objectadres overgenomen')}
                            disabled={bezig}
                            style={{
                              border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                              fontSize: 12, color: 'hsl(var(--primary))', textDecoration: 'underline',
                            }}
                          >
                            Neem objectadres over
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-soft)' }}>
                      {d.bedrag_excl_btw != null ? euro(Number(d.bedrag_excl_btw)) : '—'}
                    </span>
                    {magSchrijven && (
                      <button
                        onClick={() => doe(() => ontkoppelDossierVanObject(d.id), 'Dossier ontkoppeld')}
                        disabled={bezig}
                        title="Ontkoppelen van dit object"
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer',
                          fontSize: 12, color: 'var(--fg-muted)',
                        }}
                      >
                        Ontkoppelen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Zijkolom ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={blok}>
            <div style={kopje}>Gegevens</div>
            <dl style={{ display: 'grid', gap: 10, margin: 0, fontSize: 13 }}>
              <Regel label="Adres" waarde={objectAdresRegel(object) || '—'} />
              {object.omschrijving && <Regel label="Adressen" waarde={object.omschrijving} meerregelig />}
              <Regel label="Contact ter plaatse" waarde={
                [object.contact_naam, object.contact_telefoon, object.contact_email].filter(Boolean).join(' · ') || '—'
              } />
              {object.notities && <Regel label="Notities" waarde={object.notities} meerregelig />}
            </dl>
          </div>

          <div style={blok}>
            <div style={kopje}>Betrokken relaties</div>
            {objectRelaties.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 12 }}>
                Nog geen relaties vastgelegd. Een complex heeft vaak een VvE, een beheerder en een
                betalende partij die niet dezelfde zijn.
              </p>
            )}
            <div style={{ display: 'grid', gap: 8, marginBottom: magSchrijven ? 14 : 0 }}>
              {objectRelaties.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/relaties/${r.relatie_id}`} style={{ fontSize: 13, color: 'var(--fg)', textDecoration: 'none' }}>
                      {r.naam}
                    </Link>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                      {VASTGOED_OBJECT_ROLLEN.find(x => x.key === r.rol)?.label ?? r.rol}
                    </div>
                  </div>
                  {magSchrijven && (
                    <button
                      onClick={() => doe(() => ontkoppelRelatieVanObject(r.id, object.id), 'Relatie losgekoppeld')}
                      disabled={bezig}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--fg-muted)' }}
                    >
                      Verwijderen
                    </button>
                  )}
                </div>
              ))}
            </div>

            {magSchrijven && (
              <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <select
                  value={nieuweRelatie} onChange={e => setNieuweRelatie(e.target.value)}
                  style={selectStijl}
                >
                  <option value="">Relatie kiezen…</option>
                  {relaties.map(r => <option key={r.id} value={r.id}>{r.naam}</option>)}
                </select>
                <select
                  value={nieuweRol} onChange={e => setNieuweRol(e.target.value as VastgoedObjectRol)}
                  style={selectStijl}
                >
                  {VASTGOED_OBJECT_ROLLEN.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                <Button
                  variant="secondary"
                  disabled={!nieuweRelatie || bezig}
                  onClick={() => {
                    doe(() => koppelRelatieAanObject(object.id, nieuweRelatie, nieuweRol), 'Relatie gekoppeld')
                    setNieuweRelatie('')
                  }}
                >
                  Toevoegen
                </Button>
              </div>
            )}
          </div>

          <div style={blok}>
            <div style={kopje}>Dossiers per fase</div>
            <dl style={{ display: 'grid', gap: 8, margin: 0, fontSize: 13 }}>
              {Object.entries(totalen.aantalPerFase)
                .filter(([, n]) => n > 0)
                .map(([status, n]) => (
                  <div key={status} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <dt style={{ color: 'var(--fg-soft)' }}>{FASE_LABEL[status] ?? status}</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{n}</dd>
                  </div>
                ))}
              {totalen.aantalDossiers === 0 && (
                <span style={{ color: 'var(--fg-muted)' }}>Nog geen dossiers.</span>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

const selectStijl: React.CSSProperties = {
  height: 36, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--fg)', padding: '0 8px',
  fontFamily: 'var(--font-ui)', fontSize: 13,
}

function Regel({ label, waarde, meerregelig }: { label: string; waarde: string; meerregelig?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 2 }}>{label}</dt>
      <dd style={{ margin: 0, color: 'var(--fg)', whiteSpace: meerregelig ? 'pre-line' : 'normal' }}>{waarde}</dd>
    </div>
  )
}
