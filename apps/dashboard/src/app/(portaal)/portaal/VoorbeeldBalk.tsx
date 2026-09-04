'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { veiligNextPad } from '@/lib/auth/next-pad'
import { CONTAINER } from './ui'

/**
 * De balk boven het portaal als een collega meekijkt.
 *
 * Hij moet twee dingen doen en verder niets. Ten eerste: geen twijfel laten
 * bestaan over wie je bent. Zonder deze balk lijkt het portaal in niets op EVA
 * en is het een kwestie van tijd voordat iemand denkt dat hij als de klant is
 * ingelogd — en zich afvraagt waarom "Versturen" niet werkt. Ten tweede: zeggen
 * of de klant dit al kan bereiken, want dat is precies waar je op controleert
 * vlak voordat je het portaal openzet.
 *
 * De weg terug komt uit `?terug=` en niet uit de browsergeschiedenis: de link
 * wordt in een nieuw tabblad geopend, dus er ís geen geschiedenis. Het pad wordt
 * gevalideerd met dezelfde functie als de `?next=` van het inlogscherm — een
 * href uit de querystring is anders een open redirect.
 */
export function VoorbeeldBalk({ portaalActief }: { portaalActief: boolean }) {
  const terug = veiligNextPad(useSearchParams().get('terug'))

  return (
    <div className="border-b border-warning-200 bg-warning-50">
      <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5`}>
        <p className="text-[13px] text-warning-800">
          <span className="font-bold">Voorbeeldweergave.</span>{' '}
          Zo ziet de opdrachtgever dit project. Je kunt hier niets versturen of goedkeuren.
          {!portaalActief && (
            <span className="mt-0.5 block font-semibold">
              Het portaal staat voor dit dossier nog uit — de klant kan deze pagina nu niet openen.
            </span>
          )}
        </p>
        {terug && (
          <Link href={terug} className="shrink-0 text-xs font-semibold text-warning-800 underline">
            ← Terug naar het dossier
          </Link>
        )}
      </div>
    </div>
  )
}
