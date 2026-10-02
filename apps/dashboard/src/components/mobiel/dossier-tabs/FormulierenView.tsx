import React from 'react'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { createAdminClient } from '@everts/database/server'
import { format, parseISO } from 'date-fns'
import { nl, pl, ta } from 'date-fns/locale'
import { getAppTaal, getAppVertaler } from '@/i18n/server'

/**
 * Mobiele Formulieren-tab: de formulier-inzendingen van dit dossier (read-only
 * overzicht: sjabloonnaam, status, datum). Invullen loopt via Acties (taak →
 * `/m/taken/[taakId]/formulier`); hier is het een dossier-overzicht.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

// Labels staan in de taalbestanden (`dossiertabs.formulieren.status.*`).
const STATUS: Record<string, { sleutel: 'concept' | 'ingediend' | 'goedgekeurd' | 'afgekeurd'; kleur: string }> = {
  concept: { sleutel: 'concept', kleur: '#9aa4ab' },
  ingediend: { sleutel: 'ingediend', kleur: '#009439' },
  goedgekeurd: { sleutel: 'goedgekeurd', kleur: '#009439' },
  afgekeurd: { sleutel: 'afgekeurd', kleur: '#b42318' },
}

const DATE_FNS = { nl, pl, ta }
const GRIJS = '#9aa4ab'
const DATUMPATROON = 'd MMM yyyy'

export default async function FormulierenView({ dossierId }: { dossierId: string }) {
  const supabase = db()
  const [t, taal] = await Promise.all([getAppVertaler('dossiertabs'), getAppTaal()])
  const { data } = await supabase
    .from('form_inzendingen')
    .select('id, status, aangemaakt_op, ingediend_op, template:template_id ( naam )')
    .eq('dossier_id', dossierId)
    .order('aangemaakt_op', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inzendingen = (data ?? []) as any[]

  if (inzendingen.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 14 }}>
        {t('formulieren.geen')}
      </div>
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {inzendingen.map((i: any) => {
        const def = STATUS[i.status as string]
        const st = { label: def ? t(`formulieren.status.${def.sleutel}`) : i.status, kleur: def?.kleur ?? GRIJS }
        const datum = i.ingediend_op ?? i.aangemaakt_op
        let datumLabel = ''
        try { datumLabel = datum ? format(parseISO(datum), DATUMPATROON, { locale: DATE_FNS[taal] }) : '' } catch {}

        return (
          <div key={i.id} style={{
            padding: '12px 14px', background: 'var(--bg-elev)',
            border: '1px solid var(--border)', borderRadius: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                {i.template?.naam ? <VertaalbareTekst tekst={i.template.naam} label={false} /> : t('formulieren.formulier')}
              </div>
              {datumLabel && <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>{datumLabel}</div>}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: st.kleur, flexShrink: 0 }}>
              {st.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
