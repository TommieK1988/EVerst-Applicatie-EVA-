import React from 'react'
import { createAdminClient } from '@everts/database/server'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'

/**
 * Mobiele Formulieren-tab: de formulier-inzendingen van dit dossier (read-only
 * overzicht: sjabloonnaam, status, datum). Invullen loopt via Acties (taak →
 * `/m/taken/[taakId]/formulier`); hier is het een dossier-overzicht.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const STATUS: Record<string, { label: string; kleur: string }> = {
  concept: { label: 'Concept', kleur: '#9aa4ab' },
  ingediend: { label: 'Ingediend', kleur: '#009439' },
  goedgekeurd: { label: 'Goedgekeurd', kleur: '#009439' },
  afgekeurd: { label: 'Afgekeurd', kleur: '#b42318' },
}

export default async function FormulierenView({ dossierId }: { dossierId: string }) {
  const supabase = db()
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
        Nog geen formulieren voor dit dossier.
      </div>
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {inzendingen.map((i: any) => {
        const st = STATUS[i.status as string] ?? { label: i.status, kleur: '#9aa4ab' }
        const datum = i.ingediend_op ?? i.aangemaakt_op
        let datumLabel = ''
        try { datumLabel = datum ? format(parseISO(datum), 'd MMM yyyy', { locale: nl }) : '' } catch {}

        return (
          <div key={i.id} style={{
            padding: '12px 14px', background: '#fff',
            border: '1px solid #e3e8ea', borderRadius: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#161b20' }}>
                {i.template?.naam ?? 'Formulier'}
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
