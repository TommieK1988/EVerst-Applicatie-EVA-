'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus, Trash2, Phone, PhoneOff } from 'lucide-react'
import { Badge, Button, Input, useDialogen } from '@/components/ui'
import type { BeheerContact } from '@/lib/handboek/beheer'
import type { Zichtbaarheid } from '@/lib/handboek/kenmerken'
import {
  bewaarContact, maakContact, verwijderContact,
} from '@/app/(platform)/instellingen/handboek/actions'
import ZichtbaarheidKiezer from './ZichtbaarheidKiezer'

type Kenmerk = { key: string; label: string }
type Medewerker = { id: string; naam: string; nummer: string | null }

/**
 * De contacten achter de belknoppen op de "Wat te doen bij"-kaarten.
 *
 * Een contact is een róL, geen nummer: "Vertrouwenspersoon", niet "06-1234".
 * Het nummer komt uit de medewerkersgegevens, zodat elke knop blijft kloppen
 * als iemand een ander toestel krijgt of de rol overdraagt. Alleen voor
 * partijen zonder medewerkersrij — 112, Remplooi, de containerdienst — vul je
 * hier een eigen nummer in.
 */
export default function ContactenBeheer({
  contacten, medewerkers, werkmaatschappijen, populatie, totaal,
}: {
  contacten: BeheerContact[]
  medewerkers: Medewerker[]
  werkmaatschappijen: Kenmerk[]
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
}) {
  const router = useRouter()
  const { vraagTekst, bevestig } = useDialogen()
  const [bezig, start] = useTransition()

  async function nieuw() {
    const rol = await vraagTekst({
      titel: 'Nieuw contact',
      label: 'Rol',
      omschrijving: 'Waarvoor wordt deze persoon gebeld? Bijvoorbeeld: Wagenparkbeheer.',
      placeholder: 'Rol',
      verplicht: true,
    })
    if (!rol) return
    start(async () => {
      try {
        await maakContact(rol)
        router.refresh()
      } catch (e) {
        toast.error(String((e as Error).message))
      }
    })
  }

  async function verwijder(c: BeheerContact) {
    const ja = await bevestig({
      titel: `“${c.rol}” verwijderen?`,
      omschrijving:
        'Belknoppen die naar dit contact verwijzen verdwijnen van de betreffende kaarten.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!ja) return
    start(async () => {
      try {
        await verwijderContact(c.id)
        router.refresh()
      } catch (e) {
        toast.error(String((e as Error).message))
      }
    })
  }

  return (
    <div>
      <p className="mb-3 text-[13px] text-neutral-600">
        Een contact is een <strong>rol</strong>, geen nummer. Koppel er een medewerker aan en het
        nummer komt uit de medewerkersgegevens — dan blijft de knop kloppen als iemand een ander
        toestel krijgt. Een eigen nummer vul je alleen in voor partijen buiten Everts, zoals 112.
      </p>

      <div className="flex flex-col gap-2">
        {contacten.map((c) => (
          <ContactRij
            key={c.id}
            contact={c}
            medewerkers={medewerkers}
            werkmaatschappijen={werkmaatschappijen}
            populatie={populatie}
            totaal={totaal}
            bezig={bezig}
            onVerwijder={() => verwijder(c)}
          />
        ))}
      </div>

      {contacten.length === 0 && (
        <p className="py-6 text-center text-[13px] text-neutral-500">
          Nog geen contacten. Zonder contact heeft een situatiekaart geen belknop.
        </p>
      )}

      <Button variant="outline" className="mt-3" disabled={bezig} onClick={nieuw}>
        <Plus size={15} />
        Contact toevoegen
      </Button>
    </div>
  )
}

function ContactRij({
  contact, medewerkers, werkmaatschappijen, populatie, totaal, bezig, onVerwijder,
}: {
  contact: BeheerContact
  medewerkers: Medewerker[]
  werkmaatschappijen: Kenmerk[]
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
  bezig: boolean
  onVerwijder: () => void
}) {
  const router = useRouter()
  const [opslaan, start] = useTransition()

  const [rol, setRol] = useState(contact.rol)
  const [medewerkerId, setMedewerkerId] = useState(contact.medewerker_id ?? '')
  const [override, setOverride] = useState(contact.telefoon_override ?? '')
  const [zichtbaarheid, setZichtbaarheid] = useState<Zichtbaarheid>({
    zichtbaar_voor: contact.zichtbaar_voor,
    verborgen_voor: contact.verborgen_voor,
  })

  const gekozen = medewerkers.find((m) => m.id === medewerkerId)
  // Zelfde volgorde als bij het tonen: een eigen nummer wint van de medewerker.
  const nummer = override.trim() || gekozen?.nummer || null

  const gewijzigd =
    rol !== contact.rol ||
    (medewerkerId || null) !== contact.medewerker_id ||
    (override.trim() || null) !== contact.telefoon_override ||
    JSON.stringify(zichtbaarheid.zichtbaar_voor) !== JSON.stringify(contact.zichtbaar_voor) ||
    JSON.stringify(zichtbaarheid.verborgen_voor) !== JSON.stringify(contact.verborgen_voor)

  function bewaar() {
    start(async () => {
      try {
        await bewaarContact(contact.id, {
          rol,
          medewerker_id: medewerkerId || null,
          telefoon_override: override.trim() || null,
          ...zichtbaarheid,
        })
        toast.success('Bewaard')
        router.refresh()
      } catch (e) {
        toast.error(String((e as Error).message))
      }
    })
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 shrink-0 ${nummer ? 'text-brand-600' : 'text-neutral-300'}`}
          title={nummer ? `Belt ${nummer}` : 'Geen nummer — de knop verschijnt niet'}
        >
          {nummer ? <Phone size={18} /> : <PhoneOff size={18} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-[200px]"
              placeholder="Rol"
            />
            <select
              className="eva-input"
              style={{ width: 220, padding: '5px 10px', fontSize: 12 }}
              value={medewerkerId}
              onChange={(e) => setMedewerkerId(e.target.value)}
            >
              <option value="">Geen medewerker</option>
              {medewerkers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.naam}{m.nummer ? '' : ' (geen nummer)'}
                </option>
              ))}
            </select>
            <Input
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              className="w-[150px]"
              placeholder="Eigen nummer"
            />
            {nummer ? (
              <Badge tone="success" size="sm">Belt {nummer}</Badge>
            ) : (
              <Badge tone="warning" size="sm">Geen nummer — knop verschijnt niet</Badge>
            )}
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-[12px] text-neutral-500">
              Wie ziet deze knop?
            </summary>
            <div className="mt-1.5">
              <ZichtbaarheidKiezer
                compact
                waarde={zichtbaarheid}
                werkmaatschappijen={werkmaatschappijen}
                populatie={populatie}
                totaal={totaal}
                onWijzig={setZichtbaarheid}
              />
            </div>
          </details>

          {gewijzigd && (
            <Button size="sm" className="mt-2" loading={opslaan} onClick={bewaar}>
              Bewaren
            </Button>
          )}
        </div>

        <Button
          variant="ghost" size="icon-sm" aria-label="Verwijderen"
          disabled={bezig || opslaan} onClick={onVerwijder}
        >
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  )
}
