import Link from 'next/link'
import { UitlogKnop } from './UitlogKnop'
import { CONTAINER } from './ui'

/**
 * De vaste kop boven elke ingelogde portaalpagina. Bewust minimaal: een logo,
 * eventueel een kruimelpad terug en uitloggen. Geen menu — een klant heeft één
 * lijst met projecten en daarbinnen één project.
 */
export function PortaalKop({ naam, terug }: { naam?: string | null; terug?: { href: string; label: string } }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className={`${CONTAINER} flex items-center justify-between gap-4 py-3.5`}>
        <Link href="/portaal" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-beeldmerk.svg" alt="Everts" width={26} height={26} />
          <span className="text-[15px] font-extrabold tracking-[0.06em]">EVERTS.</span>
        </Link>
        <div className="flex items-center gap-4">
          {naam && <span className="hidden text-xs text-neutral-500 sm:inline">{naam}</span>}
          <UitlogKnop subtiel />
        </div>
      </div>
      {terug && (
        <div className={`${CONTAINER} pb-3`}>
          <Link href={terug.href} className="text-xs font-semibold text-brand-600 hover:underline">
            ← {terug.label}
          </Link>
        </div>
      )}
    </header>
  )
}
