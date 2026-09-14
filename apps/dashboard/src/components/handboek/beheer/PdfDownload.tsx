'use client'

import React, { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui'

type Kenmerk = { key: string; label: string }

/**
 * Het handboek als pdf, per profiel.
 *
 * Waarom je hier een profiel kiest en niet gewoon "alles" downloadt: het
 * handboek ís niet één document. Een flexkracht hoort de flexversie mee te
 * krijgen en een monteur met een bus het hoofdstuk over de auto. Eén uitdraai
 * met alles erin zou precies de verwarring terugbrengen die dit project moest
 * oplossen.
 *
 * De keuzes hieronder zijn de profielen die in de praktijk gevraagd worden.
 * Wie iets anders nodig heeft, bouwt het in "Bekijk als" na op het scherm.
 */
const PROFIELEN: { naam: string; kenmerken: string[]; uitleg: string }[] = [
  {
    naam: 'Eigen personeel (kantoor)',
    kenmerken: ['intern', 'kantoor'],
    uitleg: 'Directie, Projectbureau en Ondersteunend — het volledige handboek',
  },
  {
    naam: 'Eigen personeel met auto of bus',
    kenmerken: ['intern', 'voertuig'],
    uitleg: 'Uitvoering, inclusief het hoofdstuk over de auto van de zaak',
  },
  {
    naam: 'Eigen personeel zonder voertuig',
    kenmerken: ['intern'],
    uitleg: 'Uitvoering, zonder het autohoofdstuk',
  },
  {
    naam: 'Flexkrachten',
    kenmerken: ['extern'],
    uitleg: 'Ingehuurde vakmensen op de bouw',
  },
]

export default function PdfDownload({ werkmaatschappijen }: { werkmaatschappijen: Kenmerk[] }) {
  const [open, setOpen] = useState(false)
  // Werkmaatschappijen doen vandaag niets in de inhoud (het veld is bij bijna
  // niemand gevuld), maar zodra dat wél zo is hoort de uitdraai mee te bewegen.
  const extra = werkmaatschappijen.length > 0

  return (
    <div className="relative">
      <Button variant="outline" onClick={() => setOpen((v) => !v)}>
        <Printer size={15} />
        Papieren versie
      </Button>

      {open && (
        <>
          {/* Klik ernaast sluit het lijstje. */}
          <button
            type="button"
            aria-label="Sluiten"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default border-0 bg-transparent p-0"
          />
          <div className="absolute right-0 z-20 mt-1 w-[330px] rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
            <div className="px-2 py-1 text-[12px] text-neutral-500">
              Kies voor wie de uitdraai bedoeld is.
            </div>
            {PROFIELEN.map((p) => (
              <a
                key={p.naam}
                href={`/api/handboek/pdf?kenmerken=${encodeURIComponent(p.kenmerken.join(','))}&naam=${encodeURIComponent(p.naam)}`}
                onClick={() => setOpen(false)}
                className="block rounded-md px-2 py-2 no-underline hover:bg-neutral-50"
              >
                <span className="block text-[13px] font-semibold text-neutral-900">{p.naam}</span>
                <span className="block text-[12px] text-neutral-500">{p.uitleg}</span>
              </a>
            ))}
            {extra && (
              <div className="mt-1 border-t border-neutral-100 px-2 pt-2 text-[11px] text-neutral-400">
                Filteren op werkmaatschappij kan zodra dat veld bij de medewerkers is ingevuld.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
