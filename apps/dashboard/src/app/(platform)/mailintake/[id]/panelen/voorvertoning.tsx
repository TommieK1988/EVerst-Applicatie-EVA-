'use client'

/**
 * Wat er in de bevestiging staat vóór het aanmaken.
 *
 * Dit wás één lange tekst met regeleinden. De dialoog rendert zijn omschrijving
 * als gewone alinea, dus die regeleinden verdwenen en er stond een muur van tekst
 * waarin "Aanvraagdatum: —" en "Uiterste datum: —" midden in een zin beland
 * waren. Precies het omgekeerde van wat een bevestiging moet doen: dit is de
 * laatste plek waar iemand een verkeerde opdrachtgever of een gemist bestand kan
 * zien, en dan moet je kunnen scannen, niet lezen.
 *
 * Daarom een component en geen string. De dialoog accepteert een ReactNode.
 *
 * Alles is opgebouwd uit `span`-elementen met CSS-grid en niet uit `div`'s: Radix
 * rendert de omschrijving als `<p>`, en een blok-element daarin is ongeldige HTML
 * die React bij het hydrateren uit elkaar trekt.
 */

import React from 'react'

export interface Voorstel {
  titel: string
  opdrachtgever: { naam: string | null } | null
  contactpersoon: { naam: string | null } | null
  werkmaatschappij: { naam: string | null } | null
  categorie: { naam: string | null }
  werkadres: string | null
  aanvraagdatum: string | null
  deadline: string | null
  plaatsing?: { fase: string; substatus: string; bouw7Status: string }
}

export interface ProefVoorScherm {
  voorstel: Voorstel
  bestanden: { bestandsnaam: string }[]
  uitgeslotenBestanden: { bestandsnaam: string; reden: string }[]
  openPunten: string[]
}

/*
 * Geen vaste kolombreedte maar max-content: "Werkmaatschappij" is 128px breed en
 * liep in een kolom van 116px dwars door de waarde heen. Eerst de rijen omvatten,
 * zodat de labels onderling uitlijnen en de breedte meegroeit met het langste
 * woord -- ook als er ooit een label bijkomt.
 */
const TABEL = { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 10px' } as const
const LABEL = { color: 'var(--fg-muted, #64748b)' } as const
const KOP = { display: 'block', fontWeight: 600, color: 'var(--fg, #0f172a)', marginTop: 12, marginBottom: 4 } as const

/**
 * Een label/waarde-paar. Geen eigen grid: de rijen zijn cellen in één tabel, zodat
 * de labelkolom één breedte heeft en overal het langste woord volgt.
 */
function Rij({ label, waarde }: { label: string; waarde: string | null | undefined }) {
  return (
    <React.Fragment>
      <span style={LABEL}>{label}</span>
      <span>{waarde && String(waarde).trim() ? waarde : '—'}</span>
    </React.Fragment>
  )
}

/**
 * Vier regels "image00X.jpg (te klein voor een foto van het werk)" zijn geen vier
 * feiten maar één: de mail bevatte opmaak. Gelijke redenen gaan daarom samen, met
 * de namen in de tooltip voor wie het toch precies wil weten.
 */
function groepeerRedenen(
  uitgesloten: { bestandsnaam: string; reden: string }[],
): { reden: string; namen: string[] }[] {
  const perReden = new Map<string, string[]>()
  for (const u of uitgesloten) {
    const kale = u.reden.replace(/\s*\(\d+\s*kB\)\s*$/i, '')
    perReden.set(kale, [...(perReden.get(kale) ?? []), u.bestandsnaam])
  }
  return [...perReden].map(([reden, namen]) => ({ reden, namen }))
}

/** Alles wat er weggeschreven gaat worden, op een rij. */
export function Voorvertoning({ proef }: { proef: ProefVoorScherm }) {
  const v = proef.voorstel
  const overgeslagen = groepeerRedenen(proef.uitgeslotenBestanden)

  return (
    <span style={{ display: 'block' }}>
      <span style={TABEL}>
      <Rij label="Projectnaam" waarde={v.titel} />
      <Rij label="Opdrachtgever" waarde={v.opdrachtgever?.naam} />
      <Rij label="Contactpersoon" waarde={v.contactpersoon?.naam} />
      <Rij label="Werkmaatschappij" waarde={v.werkmaatschappij?.naam} />
      <Rij label="Categorie" waarde={v.categorie.naam} />
      <Rij label="Werkadres" waarde={v.werkadres} />
      <Rij label="Aanvraagdatum" waarde={v.aanvraagdatum} />
      <Rij label="Uiterste datum" waarde={v.deadline} />
      </span>

      {v.plaatsing && (
        <span style={{
          display: 'block', marginTop: 10, padding: '7px 9px', borderRadius: 6,
          background: 'var(--bg-subtle, #f1f5f9)',
        }}>
          Komt in fase <strong>{v.plaatsing.fase}</strong>, substatus{' '}
          <strong>{v.plaatsing.substatus}</strong>
          <span style={{ ...LABEL, display: 'block' }}>
            In Bouw7 op &ldquo;{v.plaatsing.bouw7Status}&rdquo;
          </span>
        </span>
      )}

      <span style={KOP}>Bestanden</span>
      {proef.bestanden.length ? (
        <span style={{ display: 'block' }}>
          {proef.bestanden.length === 1 ? 'Eén bestand gaat' : `${proef.bestanden.length} bestanden gaan`}
          {' '}naar de dossiermap:
          <span style={{ display: 'block', marginTop: 2 }}>
            {proef.bestanden.map(f => (
              <span key={f.bestandsnaam} style={{ display: 'block' }}>• {f.bestandsnaam}</span>
            ))}
          </span>
        </span>
      ) : (
        <span style={{ display: 'block' }}>Er gaan geen bestanden mee.</span>
      )}

      {overgeslagen.map(g => (
        <span key={g.reden} style={{ ...LABEL, display: 'block', marginTop: 3 }} title={g.namen.join(', ')}>
          {g.namen.length === 1 ? `${g.namen[0]}: ` : `${g.namen.length} bestanden overgeslagen — `}
          {g.reden}
        </span>
      ))}

      {proef.openPunten.length > 0 && (
        <React.Fragment>
          <span style={KOP}>Let op</span>
          {proef.openPunten.map(r => (
            <span key={r} style={{ display: 'block', marginBottom: 2 }}>• {r}</span>
          ))}
        </React.Fragment>
      )}
    </span>
  )
}

/**
 * Wat er ná het aanmaken anders bleek te staan.
 *
 * De laatste zin is de belangrijkste: bij een verschil staan de bestanden bewust
 * nog niet in de dossiermap.
 */
export function Afwijkingen({
  afwijkingen, bestandenGeplaatst,
}: {
  afwijkingen: { veld: string; verstuurd: string | null; teruggelezen: string | null }[]
  bestandenGeplaatst: boolean
}) {
  return (
    <span style={{ display: 'block' }}>
      <span style={{ display: 'block', marginBottom: 6 }}>
        Na het aanmaken is het dossier teruggelezen. Deze velden staan anders dan verstuurd:
      </span>
      {/* Eén tabel om alle rijen heen, net als bij de voorvertoning: gaf elke rij
          zijn eigen grid, dan krijgt "Categorie" een smallere labelkolom dan
          "Opdracht-substatus" en staat er een trapje in plaats van een lijst. */}
      <span style={TABEL}>
        {afwijkingen.map(a => (
          <React.Fragment key={a.veld}>
            <span style={LABEL}>{a.veld}</span>
            <span>
              verstuurd &ldquo;{a.verstuurd ?? '—'}&rdquo;, staat nu{' '}
              <strong>&ldquo;{a.teruggelezen ?? '—'}&rdquo;</strong>
            </span>
          </React.Fragment>
        ))}
      </span>
      {!bestandenGeplaatst && (
        <span style={{ display: 'block', marginTop: 8 }}>
          De bestanden zijn daarom nog niet naar de dossiermap gezet. Controleer het dossier eerst.
        </span>
      )}
    </span>
  )
}
