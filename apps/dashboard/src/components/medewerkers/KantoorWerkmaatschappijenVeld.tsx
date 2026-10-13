'use client'

/**
 * "Kantooruren voor": voor welke werkmaatschappijen deze medewerker kantoorwerk doet.
 *
 * Leeg = zoals altijd: zijn kantoorwerk gaat naar het indirecte-urenproject van zijn eigen
 * administratie. Eén vinkje = altijd naar die. Twee of meer = hij kiest het per urenregel in de
 * app. Alleen werkmaatschappijen met een gewerkt-indirect project staan erbij: op de andere valt
 * niets te boeken. Zie lib/uren/kantoor-opties.ts.
 */
export default function KantoorWerkmaatschappijenVeld({
  werkmaatschappijen, waarde, editing, onChange,
}: {
  werkmaatschappijen: { id: string; naam: string; indirect_gewerkt_dossier_id: string | null }[]
  waarde: string[]
  editing: boolean
  onChange: (ids: string[]) => void
}) {
  const kiesbaar = werkmaatschappijen.filter(w => w.indirect_gewerkt_dossier_id)

  if (!editing) {
    const namen = kiesbaar.filter(w => waarde.includes(w.id)).map(w => w.naam)
    return (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: namen.length ? 'var(--fg)' : 'var(--fg-muted)' }}>
        {namen.length ? namen.join(', ') : 'Eigen administratie'}
      </span>
    )
  }

  function wissel(id: string) {
    onChange(waarde.includes(id) ? waarde.filter(x => x !== id) : [...waarde, id])
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {kiesbaar.map(w => (
          <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
            <input type="checkbox" checked={waarde.includes(w.id)} onChange={() => wissel(w.id)} />
            {w.naam}
          </label>
        ))}
      </div>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
        Leeg = eigen administratie. Meer dan één aangevinkt = de medewerker kiest het per urenregel in de app.
      </p>
    </div>
  )
}
