'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * De tabbladen binnen één project. Een onderdeel dat uitstaat verschijnt hier
 * niet — en zijn pagina bestaat dan ook niet, de guard geeft er een 404 op. Het
 * is dus geen kwestie van een knop verbergen.
 */
export function ProjectNav({
  dossierId,
  onderdelen,
}: {
  dossierId: string
  onderdelen: {
    bestanden: boolean; fotos: boolean; facturen: boolean; meerwerk: boolean
    formulieren: boolean; aandachtspunten: boolean; planning: boolean; chat: boolean
  }
}) {
  const pad = usePathname()
  const basis = `/portaal/project/${dossierId}`

  const tabs = [
    { href: basis, label: 'Overzicht', aan: true },
    { href: `${basis}/documenten`, label: 'Documenten', aan: onderdelen.bestanden },
    { href: `${basis}/fotos`, label: "Foto's", aan: onderdelen.fotos },
    { href: `${basis}/formulieren`, label: 'Controles', aan: onderdelen.formulieren },
    { href: `${basis}/facturen`, label: 'Facturen', aan: onderdelen.facturen },
    // Op breed scherm staat het gesprek al in de zijkolom van het overzicht; een
    // tabblad ernaast zou naar dezelfde inhoud wijzen en alleen verwarren.
    { href: `${basis}/berichten`, label: 'Berichten', aan: onderdelen.chat, alleenSmal: true },
  ].filter(t => t.aan)

  if (tabs.length <= 1) return null

  return (
    <nav className="-mx-5 mt-4 overflow-x-auto px-5">
      {/* flex-shrink-0 op de items: zonder dat knijpt een smalle telefoon de
          strook samen tot onleesbare snippers in plaats van hem te laten scrollen. */}
      <ul className="flex gap-1 whitespace-nowrap">
        {tabs.map(t => {
          const actief = t.href === basis ? pad === basis : pad.startsWith(t.href)
          return (
            <li key={t.href} className={`shrink-0${t.alleenSmal ? ' lg:hidden' : ''}`}>
              <Link
                href={t.href}
                className={
                  actief
                    ? 'inline-block rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white'
                    : 'inline-block rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100'
                }
              >
                {t.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
