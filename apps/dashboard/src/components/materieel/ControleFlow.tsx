'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { PageHeader, Button } from '@/components/ui'
import { slaControleOp } from '@/app/(platform)/materieelbeheer/actions'
import { CATEGORIE_LABELS, type MaterieelObject } from '@/lib/materieel/types'

type Uitkomst = 'ok' | 'beschadigd' | 'vermist'

const UITKOMSTEN: { key: Uitkomst; label: string; kleur: string }[] = [
  { key: 'ok', label: 'Aanwezig & werkt', kleur: '#16a34a' },
  { key: 'beschadigd', label: 'Beschadigd', kleur: '#f97316' },
  { key: 'vermist', label: 'Vermist', kleur: '#dc2626' },
]

export default function ControleFlow({ objecten, laatsteControle, naam }: {
  objecten: MaterieelObject[]
  laatsteControle: Record<string, string>
  naam: string
}) {
  const router = useRouter()
  const [keuzes, setKeuzes] = React.useState<Record<string, Uitkomst>>({})
  const [bezig, setBezig] = React.useState(false)

  const totaal = objecten.length
  const gedaan = Object.keys(keuzes).length
  const klaar = gedaan === totaal && totaal > 0

  async function verstuur() {
    setBezig(true)
    let fouten = 0
    for (const obj of objecten) {
      const uitkomst = keuzes[obj.id]
      if (!uitkomst) continue
      const res = await slaControleOp(obj.id, {
        aanwezig: uitkomst !== 'vermist',
        werkt_goed: uitkomst === 'ok',
        status: uitkomst,
      })
      if (!res.ok) fouten++
    }
    setBezig(false)
    if (fouten > 0) { toast.error(`${fouten} controle(s) mislukt`); return }
    toast.success('Controle afgerond — bedankt!')
    router.push('/materieelbeheer')
    router.refresh()
  }

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Periodieke controle" title={naam ? `Controleer jouw materieel, ${naam.split(' ')[0]}` : 'Controleer jouw materieel'} />

      {totaal === 0 ? (
        <div style={{ marginTop: 24, padding: '40px 24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--bg-subtle)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Geen materieel op jouw naam</div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>Er staat momenteel niets persoonlijk aan jou toegewezen om te controleren.</div>
          <div style={{ marginTop: 16 }}><Link href="/materieelbeheer"><Button variant="secondary">Naar overzicht</Button></Link></div>
        </div>
      ) : (
        <>
          <div style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--fg-muted)' }}>
            {gedaan}/{totaal} gecontroleerd · duurt ± 2 minuten
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-subtle)', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(gedaan / totaal) * 100}%`, background: 'var(--brand-500, #16a34a)', transition: 'width .2s' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {objecten.map((obj) => (
              <div key={obj.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg-elev, var(--bg))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{obj.omschrijving}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                      {CATEGORIE_LABELS[obj.categorie]}{obj.inventarisnummer ? ` · ${obj.inventarisnummer}` : ''}
                      {laatsteControle[obj.id] ? ` · laatst: ${new Date(laatsteControle[obj.id]).toLocaleDateString('nl-NL')}` : ' · nog niet gecontroleerd'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {UITKOMSTEN.map((u) => {
                      const actief = keuzes[obj.id] === u.key
                      return (
                        <button key={u.key} type="button" onClick={() => setKeuzes((k) => ({ ...k, [obj.id]: u.key }))} style={{
                          padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          border: `1px solid ${actief ? u.kleur : 'var(--border)'}`,
                          background: actief ? `color-mix(in srgb, ${u.kleur} 12%, transparent)` : 'var(--bg)',
                          color: actief ? u.kleur : 'var(--fg-soft)',
                        }}>{u.label}</button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
            <Button variant="primary" disabled={bezig || gedaan === 0} onClick={verstuur}>
              {bezig ? 'Bezig…' : klaar ? 'Controle afronden' : `Afronden (${gedaan}/${totaal})`}
            </Button>
            {!klaar && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Je kunt ook een deel afronden en later verdergaan.</span>}
          </div>
        </>
      )}
    </div>
  )
}
