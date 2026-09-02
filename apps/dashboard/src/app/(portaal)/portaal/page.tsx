import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@everts/database/server'
import { vereisPortaalPagina } from '@/lib/portaal/auth'
import { getPortaalDossiers } from '@/lib/portaal/dossiers'
import { PortaalKop } from './PortaalKop'

export const metadata: Metadata = { title: 'Uw projecten' }
export const dynamic = 'force-dynamic'

/**
 * De startpagina van het klantportaal: de projecten die met deze contactpersoon
 * gedeeld zijn.
 *
 * Welke dat zijn hangt af van zijn scope-instelling (alleen zijn eigen projecten,
 * of alles van zijn organisatie) én van de vraag of het dossier überhaupt is
 * opengezet. Zie getPortaalDossierIds in lib/portaal/auth.ts.
 */
export default async function PortaalHome() {
  const gebruiker = await vereisPortaalPagina()
  const [dossiers, naam] = await Promise.all([
    getPortaalDossiers(gebruiker),
    haalNaam(gebruiker.contactpersoon_id, gebruiker.particulier_id),
  ])

  return (
    <>
      <PortaalKop naam={naam} />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-xl font-bold">Uw projecten</h1>

        {dossiers.length === 0 ? (
          <div className="mt-5 rounded-xl border border-neutral-200 bg-white px-5 py-8 text-center">
            <p className="text-sm font-semibold text-neutral-700">Er staat nog niets voor u klaar</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-500">
              Zodra wij een project met u delen, verschijnt het hier. Uw contactpersoon bij Everts
              kan u vertellen wanneer dat is.
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {dossiers.map(d => (
              <li key={d.id}>
                <Link
                  href={`/portaal/project/${d.id}`}
                  className="block rounded-xl border border-neutral-200 bg-white px-4 py-3.5 transition hover:border-brand-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{d.titel}</p>
                      {d.adres && <p className="mt-0.5 truncate text-xs text-neutral-500">{d.adres}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                      {d.status}
                    </span>
                  </div>
                  {d.nummer && <p className="mt-1.5 text-[11px] text-neutral-400">{d.nummer}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}

/** Alleen de voornaam voor in de kop — meer hoeft de pagina niet te weten. */
async function haalNaam(contactpersoonId: string | null, particulierId: string | null): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const tabel = contactpersoonId ? 'contactpersonen' : particulierId ? 'particulieren' : null
  const id = contactpersoonId ?? particulierId
  if (!tabel || !id) return null

  const { data } = await db.from(tabel)
    .select('voornaam, tussenvoegsel, achternaam').eq('id', id).maybeSingle()
  if (!data) return null
  return [data.voornaam, data.tussenvoegsel, data.achternaam].filter(Boolean).join(' ') || null
}
