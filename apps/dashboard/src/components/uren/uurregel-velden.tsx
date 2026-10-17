'use client'

import { useEffect, useState } from 'react'
import { FormField, Input, inputVariants } from '@/components/ui'
import {
  getUursoortenVoorCorrectie, zoekDossierVoorUren, type UursoortOptie, type DossierTreffer,
} from '@/lib/uren/bouw7-goedkeuring'
import { getUrenDoelcodes, zorgUrenDoelPsl, type UrenDoelcode } from '@/lib/dossiers/actions'

/**
 * De velden die het aanpassen en het splitsen van een urenregel delen: uursoort, dossier en
 * bewakingscode. Eén bron, zodat de twee vensters niet uit elkaar gaan lopen.
 *
 * De bewakingscodelijst komt hier zónder het prognose-filter binnen: dit is corrigeren, niet
 * invoeren. Een uur dat op de verkeerde code staat moet naar élke code te verplaatsen zijn, ook
 * naar een code waar niets voor begroot is.
 */

const selectCls = inputVariants()

/** "4,5" en "4.5" zijn allebei 4,5; leeg of onzin wordt NaN, zodat de controle het meldt. */
export const leesUren = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))
export const toonUren = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

export function useUursoorten(): UursoortOptie[] {
  const [lijst, setLijst] = useState<UursoortOptie[]>([])
  useEffect(() => { getUursoortenVoorCorrectie().then(setLijst).catch(() => {}) }, [])
  return lijst
}

/** De codelijst hangt aan het dossier waar de regel na opslaan op staat, niet waar hij vandaan komt. */
export function useBewakingscodes(dossierId: string | null): { codes: UrenDoelcode[]; laden: boolean } {
  const [codes, setCodes] = useState<UrenDoelcode[]>([])
  const [laden, setLaden] = useState(false)
  useEffect(() => {
    if (!dossierId) { setCodes([]); return }
    let levend = true
    setLaden(true)
    getUrenDoelcodes(dossierId)
      .then(c => { if (levend) setCodes(c) })
      .catch(() => { if (levend) setCodes([]) })
      .finally(() => { if (levend) setLaden(false) })
    return () => { levend = false }
  }, [dossierId])
  return { codes, laden }
}

/**
 * Het Bouw7-id van de gekozen code. Een code die nog niet onder Arbeid staat krijgt die koppeling
 * pas hier, bij het opslaan -- niet al bij het kiezen, want dan blijft er bij annuleren een lege
 * koppeling in Bouw7 achter.
 */
export async function pslVoorCode(
  dossierId: string | null, codes: UrenDoelcode[], code: string,
): Promise<{ ok: true; pslId: number | null } | { ok: false; error: string }> {
  const gekozen = codes.find(c => c.code === code)
  if (!gekozen || !dossierId) return { ok: true, pslId: null }
  if (gekozen.pslId != null) return { ok: true, pslId: gekozen.pslId }
  const psl = await zorgUrenDoelPsl(dossierId, { code: gekozen.code, hoofdstukId: gekozen.hoofdstukId }).catch(() => null)
  if (!psl || !psl.ok) return { ok: false, error: psl?.error ?? 'Bouw7 is niet bereikbaar.' }
  return { ok: true, pslId: psl.pslId }
}

/** 'werk' eerst, dan de rest: dat is waar vrijwel elke correctie naartoe gaat. */
const CATEGORIE_KOP: Record<string, string> = {
  werk: 'Gewerkt', tijd_voor_tijd: 'Tijd voor tijd', afwezig: 'Afwezig', feestdag: 'Feestdag',
}
const CATEGORIE_VOLGORDE = ['werk', 'tijd_voor_tijd', 'feestdag', 'afwezig', '']

export function UursoortKeuze({ uursoorten, waarde, onChange, terugvalNaam }: {
  uursoorten: UursoortOptie[]
  waarde: number | null
  onChange: (hourTypeId: number | null) => void
  /** Naam van de huidige uursoort, voor als die (nog) niet in de lijst staat. */
  terugvalNaam: string | null
}) {
  const gegroepeerd = CATEGORIE_VOLGORDE
    .map(cat => ({ cat, soorten: uursoorten.filter(u => (u.categorie ?? '') === cat) }))
    .filter(g => g.soorten.length > 0)
  // Een uursoort die Bouw7 wel kent maar EVA niet in zijn stamlijst heeft, zou anders stil
  // omklappen naar de eerste optie in de lijst.
  const onbekend = waarde != null && uursoorten.length > 0 && !uursoorten.some(u => u.hourTypeId === waarde)
  return (
    <FormField label="Uursoort" upper>
      <select
        value={waarde ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        className={selectCls}
        disabled={uursoorten.length === 0}
      >
        {(uursoorten.length === 0 || onbekend) && (
          <option value={waarde ?? ''}>{terugvalNaam ?? '— onbekend —'}</option>
        )}
        {gegroepeerd.map(g => (
          <optgroup key={g.cat} label={CATEGORIE_KOP[g.cat] ?? 'Overig'}>
            {g.soorten.map(u => <option key={u.hourTypeId} value={u.hourTypeId}>{u.naam}</option>)}
          </optgroup>
        ))}
      </select>
    </FormField>
  )
}

export function CodeKeuze({ codes, laden, waarde, onChange, naarAnderDossier }: {
  codes: UrenDoelcode[]
  laden: boolean
  waarde: string
  onChange: (code: string) => void
  /** Toont de uitleg als het doeldossier nog geen codes heeft. */
  naarAnderDossier: boolean
}) {
  return (
    <FormField
      label="Bewakingscode" upper
      helper={naarAnderDossier && !laden && codes.length === 0
        ? 'Dit dossier heeft nog geen bewakingscodes; de uren komen er zonder code op te staan.'
        : undefined}
    >
      <select value={waarde} onChange={e => onChange(e.target.value)} className={selectCls} disabled={laden}>
        <option value="">{laden ? 'Bezig met ophalen…' : '— geen code —'}</option>
        {/* De huidige code staat er altijd tussen, ook als hij niet in de opgehaalde lijst
            voorkomt -- anders springt het veld stilletjes naar "geen code". */}
        {!laden && waarde && !codes.some(c => c.code === waarde) && <option value={waarde}>{waarde}</option>}
        {codes.map(c => (
          <option key={c.sleutel} value={c.code}>
            {c.code}{c.naam ? ` · ${c.naam}` : ''}{c.prognoseUren > 0 ? ` (${c.prognoseUren}u begroot)` : ''}
          </option>
        ))}
      </select>
    </FormField>
  )
}

const linkCls = 'cursor-pointer border-0 bg-transparent p-0 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700'

/**
 * Het dossier van de regel, met de mogelijkheid hem naar een ander dossier te zetten. Zoekt
 * alleen dossiers met een Bouw7-koppeling: op een dossier dat daar niet bestaat kan geen
 * urenregel landen.
 */
export function DossierKeuze({ huidigLabel, doel, onKies }: {
  huidigLabel: string | null
  /** Leeg = de regel blijft op het huidige dossier. */
  doel: DossierTreffer | null
  onKies: (d: DossierTreffer | null) => void
}) {
  const [zoekOpen, setZoekOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<DossierTreffer[]>([])
  const [zoekt, setZoekt] = useState(false)

  useEffect(() => {
    if (!zoekOpen) return
    const t = term.trim()
    if (t.length < 2) { setTreffers([]); setZoekt(false); return }
    let levend = true
    setZoekt(true)
    const wacht = setTimeout(() => {
      zoekDossierVoorUren(t)
        .then(r => { if (levend) setTreffers(r) })
        .catch(() => { if (levend) setTreffers([]) })
        .finally(() => { if (levend) setZoekt(false) })
    }, 300)
    return () => { levend = false; clearTimeout(wacht) }
  }, [term, zoekOpen])

  const kies = (d: DossierTreffer) => { onKies(d); setZoekOpen(false); setTerm(''); setTreffers([]) }
  const label = doel ? [doel.nummer, doel.titel].filter(Boolean).join(' · ') : (huidigLabel ?? '— geen dossier —')

  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Dossier</span>
        {doel ? (
          <button type="button" className={linkCls} onClick={() => onKies(null)}>Toch niet verplaatsen</button>
        ) : (
          <button type="button" className={linkCls} onClick={() => setZoekOpen(o => !o)}>
            {zoekOpen ? 'Annuleren' : 'Naar ander dossier'}
          </button>
        )}
      </div>
      <div className={`flex h-9 items-center rounded-md border px-3 text-[13px] text-neutral-900 ${doel ? 'border-brand-500 bg-brand-50' : 'border-neutral-300 bg-neutral-50'}`}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </div>

      {zoekOpen && !doel && (
        <div className="mt-2">
          <Input value={term} onChange={e => setTerm(e.target.value)} placeholder="Zoek op dossiernummer of titel" autoFocus />
          <div className={`mt-1 max-h-52 overflow-y-auto rounded-md ${treffers.length ? 'border border-neutral-200' : ''}`}>
            {zoekt && <div className="px-3 py-2 text-xs text-neutral-500">Bezig met zoeken…</div>}
            {!zoekt && term.trim().length >= 2 && treffers.length === 0 && (
              <div className="px-3 py-2 text-xs text-neutral-500">Geen dossier gevonden dat aan Bouw7 gekoppeld is.</div>
            )}
            {treffers.map(d => (
              <button
                key={d.id} type="button" onClick={() => kies(d)}
                className="block w-full cursor-pointer border-0 border-b border-neutral-200 bg-transparent px-3 py-2 text-left last:border-b-0 hover:bg-neutral-50"
              >
                <span className="text-[12.5px] font-semibold text-neutral-900">{d.nummer ?? '—'}</span>
                <span className="ml-2 text-xs text-neutral-500">{d.titel ?? ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
