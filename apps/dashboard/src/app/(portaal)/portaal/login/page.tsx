import type { Metadata } from 'next'
import { LoginFormulier } from './LoginFormulier'

export const metadata: Metadata = { title: 'Inloggen' }
export const dynamic = 'force-dynamic'

/**
 * Inlogscherm van het klantportaal. Geen wachtwoord: de klant vult zijn
 * e-mailadres in en krijgt een link. Dat scheelt hem een wachtwoord dat hij
 * eens per jaar nodig heeft en ons het beheer eromheen.
 */
export default async function PortaalLoginPagina({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>
}) {
  const { fout } = await searchParams

  const foutmelding =
    fout === 'geen-toegang'
      ? 'Dit e-mailadres heeft geen toegang tot het klantportaal. Neem contact met ons op als dat niet klopt.'
      : fout === 'verlopen'
      ? 'Deze inloglink is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.'
      : null

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-beeldmerk.svg" alt="" width={30} height={30} />
        <span className="text-base font-extrabold tracking-[0.06em]">EVERTS.</span>
      </div>

      <h1 className="text-2xl font-bold">Uw projectomgeving</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Vul uw e-mailadres in. U ontvangt een link waarmee u direct inlogt — een wachtwoord
        heeft u niet nodig.
      </p>

      {foutmelding && (
        <div className="mt-5 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          {foutmelding}
        </div>
      )}

      <LoginFormulier />

      <p className="mt-8 text-xs leading-relaxed text-neutral-500">
        Werkt u bij Everts?{' '}
        <a href="/login" className="font-semibold text-brand-600 hover:underline">
          Log hier in op EVA
        </a>
        .
      </p>
    </div>
  )
}
