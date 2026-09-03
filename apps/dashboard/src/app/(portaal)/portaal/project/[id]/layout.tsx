import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GeenToegangError } from '@/lib/auth/rechten'
import { vereisPortaalPagina } from '@/lib/portaal/auth'
import { getPortaalDossier } from '@/lib/portaal/dossiers'
import { PortaalKop } from '../../PortaalKop'
import { Container, CONTAINER } from '../../ui'
import { ProjectNav } from './ProjectNav'

export const dynamic = 'force-dynamic'

/**
 * Layout rond één project: kop, projecttitel en de navigatie langs de
 * onderdelen die voor dít dossier zijn opengezet.
 *
 * Let op: deze layout draait NIET mee bij een server-action of een route
 * handler. De controle hier is dus geen vervanging voor de guard in elke
 * onderliggende pagina en actie — het is een extra laag, geen enige laag.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  await vereisPortaalPagina()
  const { id } = await params

  let dossier
  try {
    dossier = await getPortaalDossier(id)
  } catch (e) {
    // Geen toegang en niet-bestaand geven allebei dezelfde 404. Een apart
    // "geen toegang"-scherm zou verklappen dát dit dossier bestaat.
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  return (
    <>
      <PortaalKop terug={{ href: '/portaal', label: 'Alle projecten' }} />

      <div className="border-b border-neutral-200 bg-white">
        <Container className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">{dossier.titel}</h1>
              {dossier.adres && <p className="mt-0.5 text-[13px] text-neutral-500">{dossier.adres}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700">
              {dossier.status}
            </span>
          </div>
          <ProjectNav dossierId={id} onderdelen={dossier.onderdelen} />
        </Container>
      </div>

      <Container className="py-7">{children}</Container>

      <footer className={`${CONTAINER} pb-10 text-center text-[11px] text-neutral-400`}>
        Vragen over deze pagina? Neem contact op met uw contactpersoon bij Everts.{' '}
        <Link href="/portaal" className="underline">Terug naar uw projecten</Link>
      </footer>
    </>
  )
}
