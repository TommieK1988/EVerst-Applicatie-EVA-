'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { OrganisatieType } from '@everts/database'
import { organisatieTypeLabels } from '@everts/database'
import { Button } from '@/components/ui'
import { updateOrganisatieTypes, getBouw7Rollen, maakOntbrekendeBouw7Rollen } from '@/lib/relaties/actions'

const ALLE_TYPES: OrganisatieType[] = ['opdrachtgever', 'leverancier', 'onderaannemer']

/**
 * Types van een relatie. Bouw7 kent per contact maar één rol, dus elk type van een relatie die
 * in Bouw7 staat is daar een eigen contact met dezelfde gegevens. Een type aanzetten maakt dat
 * contact aan; een type met een Bouw7-contact is hier niet uit te zetten.
 */
export function TypesBlok({ relatieId, initial, bouw7Type }: {
  relatieId: string
  initial: OrganisatieType[]
  /** Type dat uit Bouw7 komt; geldt als vast tot de rollen geladen zijn. */
  bouw7Type: OrganisatieType | null
}) {
  const [types, setTypes] = useState<OrganisatieType[]>(initial)
  const [inBouw7, setInBouw7] = useState<OrganisatieType[]>(bouw7Type ? [bouw7Type] : [])
  const [bezig, setBezig] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let weg = false
    getBouw7Rollen(relatieId).then(r => { if (!weg && r.length > 0) setInBouw7(r) })
    return () => { weg = true }
  }, [relatieId])

  const ontbrekend = inBouw7.length > 0 ? types.filter(t => !inBouw7.includes(t)) : []

  async function ververs() {
    setInBouw7(await getBouw7Rollen(relatieId))
    router.refresh()
  }

  async function opslaan(nieuweTypes: OrganisatieType[]) {
    if (nieuweTypes.length === 0) return
    setBezig(true)
    const res = await updateOrganisatieTypes(relatieId, nieuweTypes)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setTypes(nieuweTypes)
    await ververs()
    if (res.waarschuwing) toast.error(res.waarschuwing, { duration: 8000 })
    else toast.success(inBouw7.length > 0 && nieuweTypes.length > types.length ? 'Type toegevoegd, ook in Bouw7' : 'Types bijgewerkt')
  }

  async function opnieuw() {
    setBezig(true)
    const res = await maakOntbrekendeBouw7Rollen(relatieId)
    setBezig(false)
    await ververs()
    if (!res.ok) toast.error(res.error, { duration: 8000 })
    else toast.success('Aangemaakt in Bouw7')
  }

  function toggle(type: OrganisatieType) {
    const nieuweTypes = types.includes(type)
      ? types.filter(t => t !== type)
      : [...types, type]
    if (nieuweTypes.length === 0) return
    opslaan(nieuweTypes)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ALLE_TYPES.map(t => {
          const actief = types.includes(t)
          // Een type met een eigen Bouw7-contact is niet uit te zetten: de sync zet het terug.
          const vast = actief && inBouw7.includes(t)
          return (
            <button
              key={t}
              onClick={() => !bezig && !vast && toggle(t)}
              disabled={bezig || vast || (actief && types.length === 1)}
              title={vast ? 'Dit type heeft in Bouw7 een eigen contact en kan alleen daar weg.' : undefined}
              style={{
                padding: '4px 12px', borderRadius: 20, border: 'none',
                cursor: bezig ? 'wait' : vast ? 'default' : 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                transition: 'all 0.15s',
                opacity: bezig ? 0.6 : 1,
                background: actief
                  ? (t === 'opdrachtgever' ? '#ecfaf0' : t === 'leverancier' ? '#eff8ff' : '#fff6ec')
                  : 'var(--bg-subtle)',
                color: actief
                  ? (t === 'opdrachtgever' ? '#0a5e28' : t === 'leverancier' ? '#175cd3' : '#b85a00')
                  : 'var(--fg-muted)',
                outline: actief ? '2px solid currentColor' : '1px solid var(--border)',
                outlineOffset: actief ? -1 : 0,
              }}
            >
              {organisatieTypeLabels[t]}
            </button>
          )
        })}
      </div>
      {ontbrekend.length > 0 ? (
        <div style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {ontbrekend.map(t => organisatieTypeLabels[t]).join(' en ')} staat nog niet in Bouw7.
          </span>
          <Button size="sm" variant="secondary" onClick={opnieuw} disabled={bezig}>Aanmaken in Bouw7</Button>
        </div>
      ) : inBouw7.length > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--fg-muted)' }}>
          Bouw7 kent per contact één type. Zet je er een type bij, dan maakt EVA in Bouw7 een extra contact met dezelfde gegevens.
        </p>
      )}
    </div>
  )
}
