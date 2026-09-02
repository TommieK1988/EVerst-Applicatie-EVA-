import type { Metadata } from 'next'
import { UitlogKnop } from '../UitlogKnop'

export const metadata: Metadata = { title: 'Geen toegang' }
export const dynamic = 'force-dynamic'

/**
 * Je bent ingelogd, maar dit account hoort niet bij een klantomgeving.
 *
 * Dit scherm bestaat om een lus te voorkomen: doorsturen naar het inlogscherm
 * werkt niet, want de middleware ziet een geldige sessie en stuurt je meteen
 * weer hierheen. Uitloggen is dus de enige zinvolle uitweg — vandaar de knop.
 *
 * Komt in de praktijk voor bij een ingetrokken portaalaccount, en bij een
 * collega die per ongeluk op een klantlink klikt terwijl hij in EVA is ingelogd.
 */
export default function GeenToegangPagina() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-beeldmerk.svg" alt="" width={30} height={30} />
        <span className="text-base font-extrabold tracking-[0.06em]">EVERTS.</span>
      </div>

      <h1 className="text-2xl font-bold">Geen toegang</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        U bent ingelogd, maar dit account heeft geen projectomgeving bij ons. Klopt dat niet?
        Neem dan contact op met uw contactpersoon bij Everts.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <UitlogKnop label="Uitloggen en opnieuw proberen" />
        <a
          href="/login"
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          Ik werk bij Everts
        </a>
      </div>
    </div>
  )
}
