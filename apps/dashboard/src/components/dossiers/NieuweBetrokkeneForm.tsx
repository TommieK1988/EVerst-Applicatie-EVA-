'use client'

/**
 * Nieuwe contactpersoon vanuit het venster "Betrokkene toevoegen".
 *
 * De persoon wordt aangemaakt én meteen aan het dossier gehangen. Waar hij bij hoort kies je hier:
 * nergens (een losse persoon), bij een organisatie (zijn werkgever — gaat ook naar Bouw7), of bij
 * een factuuradres (het VvE-bestuur, de assetmanager van een portefeuille).
 *
 * De opdrachtgever en het factuuradres van het dossier staan al klaar, want daar hoort een nieuwe
 * persoon meestal bij. Een andere organisatie is te zoeken.
 */

import React, { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { zoekRelaties } from '@/lib/dossiers/actions'
import {
  getKoppelKeuzes, getFactuuradressenVanRelatie, maakBetrokkeneContactpersoon,
  type FactuuradresKeuze, type KoppelKeuzes,
} from '@/lib/dossiers/betrokkene-aanmaken'
import { DialogBody, DialogFooter, Button, Input, FormField, Spinner } from '@/components/ui'

type Soort = 'los' | 'organisatie' | 'factuuradres'
type Organisatie = { id: string; naam: string }

/** "Jan de Vries" → voornaam, tussenvoegsel, achternaam — wat er in het zoekveld al stond. */
function splitsNaam(term: string): { voornaam: string; tussenvoegsel: string; achternaam: string } {
  const delen = term.trim().split(/\s+/).filter(Boolean)
  if (delen.length === 0 || term.includes('@')) return { voornaam: '', tussenvoegsel: '', achternaam: '' }
  if (delen.length === 1) return { voornaam: delen[0], tussenvoegsel: '', achternaam: '' }
  return {
    voornaam: delen[0],
    tussenvoegsel: delen.slice(1, -1).join(' '),
    achternaam: delen[delen.length - 1],
  }
}

const KEUZE_KLASSE = 'flex w-full items-center justify-between gap-3 rounded-lg border px-[11px] py-2 text-left transition-colors'
const keuzeKlasse = (actief: boolean) => `${KEUZE_KLASSE} ${actief
  ? 'border-brand-400 bg-brand-50'
  : 'border-neutral-200 bg-white hover:border-brand-300 hover:bg-brand-50'}`

export default function NieuweBetrokkeneForm({
  dossierId,
  beginTerm,
  beginRol,
  onTerug,
  onKlaar,
}: {
  dossierId: string
  beginTerm: string
  beginRol: string
  onTerug: () => void
  onKlaar: () => void
}) {
  const [naam, setNaam] = useState(() => splitsNaam(beginTerm))
  const [email, setEmail] = useState(beginTerm.includes('@') ? beginTerm.trim() : '')
  const [telefoon, setTelefoon] = useState('')
  const [functie, setFunctie] = useState('')
  const [rol, setRol] = useState(beginRol)

  const [soort, setSoort] = useState<Soort>('los')
  const [keuzes, setKeuzes] = useState<KoppelKeuzes | null>(null)
  const [organisatie, setOrganisatie] = useState<Organisatie | null>(null)
  const [adressen, setAdressen] = useState<FactuuradresKeuze[]>([])
  const [adresVan, setAdresVan] = useState<Organisatie | null>(null)
  const [factuuradresId, setFactuuradresId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let weg = false
    getKoppelKeuzes(dossierId)
      .then(k => {
        if (weg) return
        setKeuzes(k)
        setOrganisatie(k.opdrachtgever)
        setAdressen(k.factuuradressen)
        setFactuuradresId(k.dossierFactuuradresId ?? k.factuuradressen[0]?.id ?? null)
      })
      .catch(() => { if (!weg) setKeuzes({ opdrachtgever: null, factuuradressen: [], dossierFactuuradresId: null }) })
    return () => { weg = true }
  }, [dossierId])

  async function kiesAdresOrganisatie(org: Organisatie) {
    setAdresVan(org)
    setFactuuradresId(null)
    try {
      const lijst = await getFactuuradressenVanRelatie(org.id)
      setAdressen(lijst)
      setFactuuradresId(lijst[0]?.id ?? null)
    } catch {
      toast.error('Factuuradressen ophalen is niet gelukt')
    }
  }

  const naamCompleet = naam.voornaam.trim() !== '' && naam.achternaam.trim() !== ''
  const koppelingCompleet = soort === 'los'
    || (soort === 'organisatie' && organisatie != null)
    || (soort === 'factuuradres' && factuuradresId != null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!naamCompleet || !koppelingCompleet) return
    startTransition(async () => {
      const res = await maakBetrokkeneContactpersoon({
        dossier_id: dossierId,
        voornaam: naam.voornaam,
        tussenvoegsel: naam.tussenvoegsel,
        achternaam: naam.achternaam,
        email,
        telefoon,
        functie,
        rol,
        koppeling: soort === 'organisatie' ? { soort, relatie_id: organisatie!.id }
          : soort === 'factuuradres' ? { soort, factuuradres_id: factuuradresId! }
          : { soort: 'los' },
      })
      if (!res.ok) { toast.error(res.error); return }
      if (res.waarschuwing) toast(res.waarschuwing, { icon: '⚠️' })
      else toast.success(`${[naam.voornaam, naam.tussenvoegsel, naam.achternaam].filter(Boolean).join(' ')} aangemaakt en toegevoegd`)
      onKlaar()
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-[2fr_1fr_2fr] gap-2">
            <FormField label="Voornaam" required>
              <Input value={naam.voornaam} onChange={e => setNaam(p => ({ ...p, voornaam: e.target.value }))} autoFocus />
            </FormField>
            <FormField label="Tussenv.">
              <Input value={naam.tussenvoegsel} onChange={e => setNaam(p => ({ ...p, tussenvoegsel: e.target.value }))} placeholder="van" />
            </FormField>
            <FormField label="Achternaam" required>
              <Input value={naam.achternaam} onChange={e => setNaam(p => ({ ...p, achternaam: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="E-mail">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </FormField>
            <FormField label="Telefoon">
              <Input value={telefoon} onChange={e => setTelefoon(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Rol bij deze opdracht">
            <Input value={rol} onChange={e => setRol(e.target.value)} placeholder="Opzichter, Architect, VvE-voorzitter…" />
          </FormField>

          <FormField label="Koppelen aan">
            {/* Tailwind i.p.v. DS-tokens: de dialoog hangt in een portal buiten `.eva`. */}
            <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
              {([['los', 'Los'], ['organisatie', 'Organisatie'], ['factuuradres', 'Factuuradres']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSoort(key)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    soort === key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          {soort === 'los' && (
            <span className="px-0.5 text-xs text-neutral-500">
              De persoon komt in het adresboek zonder organisatie. Koppelen kan later alsnog op zijn kaart.
            </span>
          )}

          {soort === 'organisatie' && (
            <div className="flex flex-col gap-2">
              {organisatie ? (
                <div className={keuzeKlasse(true)}>
                  <span className="text-[13px] font-semibold text-neutral-900">{organisatie.naam}</span>
                  <button type="button" onClick={() => setOrganisatie(null)} className="text-xs font-semibold text-brand-600">
                    Andere kiezen
                  </button>
                </div>
              ) : (
                <OrganisatieZoeker onKies={setOrganisatie} />
              )}
              <FormField label="Functie">
                <Input value={functie} onChange={e => setFunctie(e.target.value)} placeholder="Projectmanager, Opzichter…" />
              </FormField>
            </div>
          )}

          {soort === 'factuuradres' && (
            <div className="flex flex-col gap-2">
              {keuzes == null ? (
                <div className="flex items-center gap-2 py-2 text-[13px] text-neutral-500"><Spinner size="sm" /> Laden…</div>
              ) : (
                <>
                  {adresVan && (
                    <span className="px-0.5 text-xs text-neutral-500">Factuuradressen van {adresVan.naam}</span>
                  )}
                  <div className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
                    {adressen.length === 0 && (
                      <span className="px-0.5 py-1 text-xs text-neutral-500">Geen factuuradressen gevonden.</span>
                    )}
                    {adressen.map(a => (
                      <button key={a.id} type="button" onClick={() => setFactuuradresId(a.id)} className={keuzeKlasse(a.id === factuuradresId)}>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[13px] font-semibold text-neutral-900">
                            {a.label}
                            {a.id === keuzes.dossierFactuuradresId && !adresVan && (
                              <span className="ml-2 text-xs font-normal text-neutral-500">op dit dossier</span>
                            )}
                          </span>
                          <span className="truncate text-xs text-neutral-500">
                            {[a.adres, a.relatie_naam].filter(Boolean).join(' — ')}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <OrganisatieZoeker placeholder="Adres van een andere organisatie…" onKies={kiesAdresOrganisatie} />
                </>
              )}
              <FormField label="Rol bij dit adres">
                <Input value={functie} onChange={e => setFunctie(e.target.value)} placeholder="Voorzitter, Penningmeester, Assetmanager…" />
              </FormField>
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onTerug} disabled={isPending}>Terug naar zoeken</Button>
        <Button type="submit" variant="primary" disabled={isPending || !naamCompleet || !koppelingCompleet}>
          {isPending ? 'Aanmaken…' : 'Aanmaken en toevoegen'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Organisatie zoeken met dezelfde zoekfunctie als het tabblad Organisatie. */
function OrganisatieZoeker({
  onKies,
  placeholder = 'Zoek een organisatie…',
}: {
  onKies: (org: Organisatie) => void
  placeholder?: string
}) {
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<(Organisatie & { regel: string | null })[]>([])
  const [zoekt, setZoekt] = useState(false)

  useEffect(() => {
    const schoon = term.trim()
    if (schoon.length < 2) { setTreffers([]); return }
    let afgebroken = false
    setZoekt(true)
    const timer = setTimeout(async () => {
      try {
        const res = await zoekRelaties(schoon)
        if (afgebroken) return
        setTreffers(res.slice(0, 8).map(r => ({
          id: r.id,
          naam: r.naam,
          regel: [r.plaats, (r.types ?? []).join(' · ')].filter(Boolean).join(' — ') || null,
        })))
      } catch {
        if (!afgebroken) toast.error('Zoeken is niet gelukt')
      } finally {
        if (!afgebroken) setZoekt(false)
      }
    }, 250)
    return () => { afgebroken = true; clearTimeout(timer) }
  }, [term])

  return (
    <div className="flex flex-col gap-1.5">
      <Input value={term} onChange={e => setTerm(e.target.value)} placeholder={placeholder} />
      {zoekt && <div className="flex items-center gap-2 px-0.5 py-1 text-xs text-neutral-500"><Spinner size="sm" /> Zoeken…</div>}
      {!zoekt && treffers.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => { onKies(t); setTerm(''); setTreffers([]) }}
          className={keuzeKlasse(false)}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-neutral-900">{t.naam}</span>
            {t.regel && <span className="truncate text-xs text-neutral-500">{t.regel}</span>}
          </span>
          <span className="shrink-0 text-xs font-semibold text-brand-600">Kiezen</span>
        </button>
      ))}
    </div>
  )
}
