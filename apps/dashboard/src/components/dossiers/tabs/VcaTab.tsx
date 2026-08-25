import React from 'react'
import Link from 'next/link'
import { createAdminClient } from '@everts/database/server'
import { getVcaActies, type VcaActie } from '@/lib/kam/vca-acties'
import { getVcaBemensing, type VcaBemensingRij } from '@/lib/kam/vca-bemensing'
import { VCA_SOORT_LABEL, type VcaStatus } from '@/lib/kam/vca'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

type Props = { dossierId: string }

type VcaInzending = {
  id: string
  template_id: string
  status: string
  aangemaakt_op: string
  ingediend_op: string | null
  project_ref: string | null
  template: { naam: string } | null
}

export default async function VcaTab({ dossierId }: Props) {
  const supabase = createAdminClient()

  const [bemensing, inzendingenResultaat, acties] = await Promise.all([
    // De medewerkers op deze opdracht met hun VCA-diploma.
    getVcaBemensing(dossierId),

    // Ingediende VCA-formulieren voor dit dossier
    supabase
      .from('form_inzendingen')
      .select('id, template_id, status, aangemaakt_op, ingediend_op, project_ref, template:template_id(naam)')
      .eq('dossier_id', dossierId)
      .order('aangemaakt_op', { ascending: false })
      .limit(50),

    // De VCA-acties: taken uit de actielijst met een KAM/VGM-formulier eraan.
    getVcaActies(dossierId),
  ])

  const inzendingen  = (inzendingenResultaat.data ?? []) as VcaInzending[]
  const vcaOpOrde    = bemensing.filter(b => b.status === 'geldig').length
  const ingevuld     = acties.filter(a => a.formulier_ingevuld).length
  const openstaand   = acties.filter(a => a.status !== 'gereed').length

  function formatDatum(iso: string) {
    try { return format(new Date(iso), 'd MMM yyyy', { locale: nl }) } catch { return '—' }
  }

  const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    concept:     { bg: '#f3f4f6', color: '#6b7280' },
    ingediend:   { bg: '#dbeafe', color: '#1d4ed8' },
    goedgekeurd: { bg: '#dcfce7', color: '#16a34a' },
    afgekeurd:   { bg: '#fee2e2', color: '#dc2626' },
  }

  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 860 }}>
      <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700 }}>VCA</h2>

      {/* ── VCA-acties uit de actielijst ───────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          VCA-acties ({ingevuld} van {acties.length} ingevuld{openstaand > 0 ? `, ${openstaand} open` : ''})
        </h3>
        {acties.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Geen VCA-acties op deze opdracht. Koppel een actielijst waarin de taken een
            KAM/VGM-formulier hebben; die verschijnen hier.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {acties.map(a => <ActieRegel key={a.id} actie={a} formatDatum={formatDatum} />)}
          </div>
        )}
      </section>

      {/* ── VCA-diploma's van de mensen op deze opdracht ──────────── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          VCA-diploma&apos;s op deze opdracht
          {bemensing.length > 0 && ` (${vcaOpOrde} van ${bemensing.length} geldig)`}
        </h3>
        {bemensing.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Er staat nog niemand ingepland op deze opdracht en er zijn geen rollen toegekend.
          </p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Medewerker', 'Rol', 'Diploma', 'Geldig tot', 'Status'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bemensing.map((b, i) => (
                  <tr key={b.medewerker_id} style={{ borderBottom: i < bemensing.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{b.naam}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{b.rol}</td>
                    <td style={{ padding: '10px 14px', color: b.soort ? 'var(--text)' : 'var(--text-muted)' }}>
                      {b.soort ? VCA_SOORT_LABEL[b.soort] : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {b.geldig_tot ? formatDatum(b.geldig_tot) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <DiplomaBadge rij={b} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Ingediende VCA-formulieren ─────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            VCA-formulieren ({inzendingen.length})
          </h3>
        </div>
        {inzendingen.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Nog geen VCA-formulieren ingediend voor deze opdracht.
          </p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Status', 'Formulier', 'Datum', 'Ingediend'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                  <th style={{ padding: '9px 14px', width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {inzendingen.map((inz, i) => {
                  const s = STATUS_BADGE[inz.status] ?? STATUS_BADGE.concept
                  return (
                    <tr key={inz.id} style={{ borderBottom: i < inzendingen.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
                          {inz.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{inz.template?.naam ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{formatDatum(inz.aangemaakt_op)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{inz.ingediend_op ? formatDatum(inz.ingediend_op) : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <Link href={`/formulieren/${inz.template_id}/inzendingen/${inz.id}`}
                          style={{ color: '#009439', fontSize: 12, textDecoration: 'none' }}>
                          →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}

const ACTIE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  open:           { bg: '#fef9c3', color: '#854d0e', label: 'Open' },
  in_behandeling: { bg: '#dbeafe', color: '#1d4ed8', label: 'In behandeling' },
  wacht_op:       { bg: '#f3f4f6', color: '#6b7280', label: 'Wacht op' },
  gereed:         { bg: '#dcfce7', color: '#16a34a', label: 'Gereed' },
}

/**
 * Eén VCA-actie. De statusbadge zegt of de actie is afgevinkt, het label ernaast of
 * het formulier ook echt is ingediend — een actie kan afgevinkt zijn zonder formulier,
 * en dat is precies wat je hier wilt zien.
 */
function ActieRegel({
  actie,
  formatDatum,
}: {
  actie: VcaActie
  formatDatum: (iso: string) => string
}) {
  const badge = ACTIE_BADGE[actie.status] ?? ACTIE_BADGE.open
  const href = actie.formulier_ingevuld && actie.inzending_id
    ? `/formulieren/${actie.formulier_template_id}/inzendingen/${actie.inzending_id}`
    : `/formulieren/${actie.formulier_template_id}/invullen?task_id=${actie.id}`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      border: '1px solid var(--border)', background: 'var(--surface)',
    }}>
      <span style={{
        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
        background: badge.bg, color: badge.color, flexShrink: 0,
      }}>
        {badge.label}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{actie.titel}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {actie.formulier_naam}
          {' · '}
          <span style={{ color: actie.formulier_ingevuld ? '#16a34a' : '#b45309', fontWeight: 600 }}>
            {actie.formulier_ingevuld ? 'ingediend' : 'nog niet ingediend'}
          </span>
        </div>
      </div>

      {actie.deadline && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
          {formatDatum(actie.deadline)}
        </span>
      )}

      <Link href={href} style={{ color: '#009439', fontSize: 12, textDecoration: 'none', flexShrink: 0 }}>
        {actie.formulier_ingevuld ? 'Bekijken' : 'Invullen'}
      </Link>
    </div>
  )
}

const DIPLOMA_BADGE: Record<VcaStatus, { bg: string; color: string; label: string }> = {
  geldig:              { bg: '#dcfce7', color: '#16a34a', label: 'Geldig' },
  verloopt_binnenkort: { bg: '#fef9c3', color: '#854d0e', label: 'Verloopt binnenkort' },
  verlopen:            { bg: '#fee2e2', color: '#dc2626', label: 'Verlopen' },
  geen:                { bg: '#fee2e2', color: '#dc2626', label: 'Geen diploma' },
  onbekend:            { bg: '#f3f4f6', color: '#6b7280', label: 'Einddatum onbekend' },
}

/** Statuskleur van een diploma, met het aantal dagen erbij zolang dat iets zegt. */
function DiplomaBadge({ rij }: { rij: VcaBemensingRij }) {
  const badge = DIPLOMA_BADGE[rij.status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
        background: badge.bg, color: badge.color, whiteSpace: 'nowrap',
      }}>
        {badge.label}
      </span>
      {rij.status === 'verloopt_binnenkort' && rij.dagen_tot_verval != null && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          nog {rij.dagen_tot_verval} dagen
        </span>
      )}
    </span>
  )
}
