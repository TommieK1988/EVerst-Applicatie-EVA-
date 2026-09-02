import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { GeenToegangError } from '@/lib/auth/rechten'
import { getPortaalDossier } from '@/lib/portaal/dossiers'
import { getPortaalPlanning } from '@/lib/portaal/planning'
import { getPortaalAandachtspunten } from '@/lib/portaal/aandachtspunten'
import { periode, datum } from '@/lib/portaal/format'
import { Kaart, Leeg } from '../../ui'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Project' }
export const dynamic = 'force-dynamic'

/**
 * Overzicht van één project: wie eraan werkt, wanneer wat gebeurt en welke
 * punten er nog open staan. De zware onderdelen staan in een <Suspense>, zodat
 * een trage bron de rest van de pagina niet ophoudt.
 */
export default async function ProjectOverzicht({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Ook hier vangen, niet alleen in de layout: die twee renderen naast elkaar,
  // en een ongevangen fout in de pagina levert een foutscherm op in plaats van
  // een 404 — met EVA-teksten die een klant niets aangaan.
  let dossier
  try {
    dossier = await getPortaalDossier(id)
  } catch (e) {
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  return (
    <div className="space-y-5">
      <Kaart titel="Uw contactpersonen bij Everts">
        {dossier.betrokkenen.length === 0 ? (
          <p className="text-[13px] text-neutral-500">
            Zodra het projectteam is samengesteld, ziet u hier bij wie u terechtkunt.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {dossier.betrokkenen.map((b, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                {b.fotoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={b.fotoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                    {b.naam.split(/\s+/).map(w => w[0]).slice(0, 2).join('')}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.naam}</p>
                  <p className="truncate text-xs text-neutral-500">{b.rol}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {b.telefoon && (
                    <a href={`tel:${b.telefoon.replace(/\s/g, '')}`} className="block font-medium text-brand-600 hover:underline">
                      {b.telefoon}
                    </a>
                  )}
                  {b.email && (
                    <a href={`mailto:${b.email}`} className="block text-neutral-500 hover:underline">
                      {b.email}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Kaart>

      {dossier.onderdelen.planning && (
        <Suspense fallback={<Kaart titel="Planning"><Laden /></Kaart>}>
          <PlanningBlok dossierId={id} />
        </Suspense>
      )}

      {dossier.onderdelen.aandachtspunten && (
        <Suspense fallback={<Kaart titel="Aandachtspunten"><Laden /></Kaart>}>
          <PuntenBlok dossierId={id} />
        </Suspense>
      )}
    </div>
  )
}

function Laden() {
  return <p className="text-[13px] text-neutral-400">Bezig met laden…</p>
}

/**
 * Fases met hun periode. Staat er detailplanning aan, dan komen de activiteiten
 * eronder. Namen van medewerkers komen hier in geen enkele stand in beeld — de
 * datalaag haalt ze niet eens op.
 */
async function PlanningBlok({ dossierId }: { dossierId: string }) {
  const fases = await getPortaalPlanning(dossierId)

  return (
    <Kaart titel="Planning">
      {fases.length === 0 ? (
        <Leeg>De planning van dit project is nog niet gedeeld.</Leeg>
      ) : (
        <ol className="space-y-3">
          {fases.map((f, i) => (
            <li key={i} className="border-l-2 border-brand-200 pl-3.5">
              <p className="text-sm font-semibold">{f.naam}</p>
              <p className="text-xs text-neutral-500">{periode(f.start, f.eind)}</p>
              {f.activiteiten.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {f.activiteiten.map(a => (
                    <li key={a.id} className="flex justify-between gap-3 text-xs text-neutral-600">
                      <span className="truncate">{a.titel}</span>
                      <span className="shrink-0 text-neutral-400">{periode(a.start, a.eind)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Kaart>
  )
}

async function PuntenBlok({ dossierId }: { dossierId: string }) {
  const punten = await getPortaalAandachtspunten(dossierId)

  return (
    <Kaart titel="Aandachtspunten" subtitel={punten.length > 0 ? `${punten.length} punt${punten.length === 1 ? '' : 'en'}` : undefined}>
      {punten.length === 0 ? (
        <Leeg>Er staan op dit moment geen punten open.</Leeg>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {punten.map(p => (
            <li key={p.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {p.volgnummer != null && (
                      <span className="mr-1.5 font-bold text-neutral-400">
                        {String(p.volgnummer).padStart(2, '0')}
                      </span>
                    )}
                    {p.omschrijving}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {[p.ruimte, p.moment, p.deadline ? `gereed ${datum(p.deadline)}` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600">
                  {p.status}
                </span>
              </div>
              {p.fotoUrls.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {p.fotoUrls.slice(0, 4).map((u, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img key={i} src={u} alt="" className="h-14 w-14 rounded-md object-cover" />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Kaart>
  )
}
