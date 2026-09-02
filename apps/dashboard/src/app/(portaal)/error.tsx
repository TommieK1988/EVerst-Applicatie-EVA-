'use client'

import { useEffect } from 'react'

/**
 * Foutscherm binnen het klantportaal.
 *
 * Zonder dit bestand valt een fout terug op het foutscherm van EVA, met de tekst
 * "EVA kon deze pagina niet laden" en een foutcode om aan de helpdesk door te
 * geven. Dat is intern taalgebruik dat een opdrachtgever niets zegt.
 *
 * De foutmelding zelf komt hier bewust niet in beeld: die kan een tabelnaam of
 * een dossier-id bevatten. Wat er misging staat in het serverlog.
 */
export default function PortaalFout({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[portaal] onverwachte fout', error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-beeldmerk.svg" alt="" width={30} height={30} />
        <span className="text-base font-extrabold tracking-[0.06em]">EVERTS.</span>
      </div>

      <h1 className="text-2xl font-bold">Er ging iets mis</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        We konden deze pagina even niet laden. Probeer het opnieuw — blijft het misgaan, neem dan
        contact op met uw contactpersoon bij Everts.
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-6 w-fit rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
      >
        Opnieuw proberen
      </button>
    </div>
  )
}
