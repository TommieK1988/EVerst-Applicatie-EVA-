'use client'

/**
 * De velden van een verkoopkans, als één blok.
 *
 * Een verkoopkans is wat er overblijft als een offerte verloren gaat, vervalt of wordt
 * uitgesteld. Drie dingen onderscheiden hem van een losse aantekening, en die zijn daarom alle
 * drie verplicht:
 *
 *   * **Uitleg** — waar gaat het over, zodat een collega over een jaar niet hoeft te raden;
 *   * **Actiehouder** — één naam, anders is het van niemand;
 *   * **Deadline** — zonder datum komt hij nooit vanzelf terug in beeld.
 *
 * De **klant** staat er los van en is optioneel. Ontstaat de kans bij het afsluiten van een
 * dossier, dan neemt de server de opdrachtgever van dat dossier over en hoef je hier niets te
 * doen. Begin je een kans zonder dossier, dan is de klant juist het enige aanknopingspunt om
 * te weten wie je straks belt — vandaar dat je hem hier kunt kiezen.
 *
 * Bewust gedeeld tussen de uitkomstdialoog, de afsluitdialoog op het bord en het
 * verkoopkansen-overzicht: drie plekken die dezelfde kans aanmaken horen dezelfde vragen te
 * stellen, in dezelfde woorden.
 */

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { datumNaarISO } from '@/lib/dossiers/datum-regels'
import { zoekRelaties } from '@/lib/dossiers/actions'
import type { VerkoopkansInvoer } from '@/lib/commercie/types'

export type MedewerkerKeuze = { id: string; naam: string }

export function VerkoopkansVelden({
  waarde, onChange, medewerkers, uitgeschakeld,
}: {
  waarde: VerkoopkansInvoer
  onChange: (v: VerkoopkansInvoer) => void
  medewerkers: MedewerkerKeuze[]
  uitgeschakeld?: boolean
}) {
  const datum = waarde.deadline ? new Date(`${waarde.deadline}T12:00:00`) : undefined

  return (
    <div className="space-y-3">
      <Veld tekst="Waar gaat de kans over?">
        <Input
          value={waarde.uitleg}
          disabled={uitgeschakeld}
          onChange={e => onChange({ ...waarde, uitleg: e.target.value })}
          placeholder="Bv. 'Schilderwerk complex Zuid komt in 2027 opnieuw langs — nu geen budget'"
        />
      </Veld>

      <Veld tekst="Klant of opdrachtgever (optioneel)">
        <KlantKiezer
          relatieId={waarde.relatieId ?? null}
          relatieNaam={waarde.relatieNaam ?? null}
          uitgeschakeld={uitgeschakeld}
          onKies={(id, naam) => onChange({ ...waarde, relatieId: id, relatieNaam: naam })}
        />
      </Veld>

      <Veld tekst="Wie gaat erachteraan?">
        <select
          className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] disabled:bg-neutral-50"
          value={waarde.actiehouderId}
          disabled={uitgeschakeld}
          onChange={e => onChange({ ...waarde, actiehouderId: e.target.value })}
        >
          <option value="">Kies een collega…</option>
          {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
        </select>
      </Veld>

      <Veld tekst="Wanneer pakken we het weer op?">
        <DatePicker
          value={datum}
          onChange={d => onChange({ ...waarde, deadline: d ? datumNaarISO(d) : '' })}
        />
      </Veld>
    </div>
  )
}

/**
 * Zoekveld voor de opdrachtgever.
 *
 * Zoekt via dezelfde server-action als de Nieuwe aanvraag-modal, dus op naam, adres én
 * contactpersoon. De gekozen relatie wordt als eerste optie in de lijst gehouden: de zoekactie
 * geeft alleen treffers op de laatste zoekterm terug, en zonder die regel zou de Combobox een
 * al gekozen klant weer als leeg tonen zodra je iets anders intypt.
 *
 * `contentClassName` met een hogere z-index is nodig omdat dit veld altijd in een dialoog
 * staat; het popover-paneel zit standaard op z-50 en zou daarachter vallen.
 */
function KlantKiezer({ relatieId, relatieNaam, onKies, uitgeschakeld }: {
  relatieId: string | null
  relatieNaam: string | null
  onKies: (id: string | null, naam: string | null) => void
  uitgeschakeld?: boolean
}) {
  const [opties, setOpties] = React.useState<ComboboxOption[]>([])

  const gekozen: ComboboxOption[] = relatieId
    ? [{ value: relatieId, label: relatieNaam ?? 'Gekozen klant' }]
    : []

  const alle = [...gekozen, ...opties.filter(o => o.value !== relatieId)]

  async function zoek(term: string) {
    if (term.trim().length < 2) { setOpties([]); return }
    try {
      const treffers = await zoekRelaties(term, { type: 'opdrachtgever' })
      // Plaats én contactpersoon onder de naam: het adresboek kent meerdere relaties met
      // dezelfde naam op een andere vestiging, en op naam alleen kies je vroeg of laat de
      // verkeerde (zie de VvE Beheer-verwarring in de projectnotities).
      setOpties(treffers.map(r => ({
        value: r.id,
        label: r.naam,
        sub: [r.plaats, r.contactpersoon?.naam].filter(Boolean).join(' · ') || undefined,
      })))
    } catch {
      setOpties([])
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Combobox
          options={alle}
          value={relatieId ?? undefined}
          onChange={v => onKies(v, alle.find(o => o.value === v)?.label ?? null)}
          onSearch={zoek}
          disabled={uitgeschakeld}
          placeholder="Geen klant gekoppeld"
          searchPlaceholder="Zoek op naam, plaats of contactpersoon…"
          emptyText="Typ minimaal twee letters."
          contentClassName="z-[110]"
        />
      </div>
      {relatieId && !uitgeschakeld && (
        <button
          type="button"
          className="shrink-0 text-xs text-neutral-500 underline"
          onClick={() => onKies(null, null)}
        >
          Wissen
        </button>
      )}
    </div>
  )
}

function Veld({ tekst, children }: { tekst: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-700">{tekst}</span>
      {children}
    </label>
  )
}
