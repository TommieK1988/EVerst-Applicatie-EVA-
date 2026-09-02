import Link from 'next/link'

/**
 * 404 binnen het klantportaal.
 *
 * Zonder dit bestand valt een niet-gevonden portaalpagina terug op de 404 van
 * EVA zelf — met interne termen en een link naar het medewerkersdashboard. Voor
 * een klant is dat verwarrend en het verklapt bovendien dat hij tegen een
 * bedrijfssysteem aankijkt.
 *
 * Deze pagina verschijnt ook als iemand een project opvraagt dat niet van hem
 * is. Dat is bewust dezelfde melding als voor een project dat niet bestaat:
 * "u heeft hier geen toegang toe" zou bevestigen dát het bestaat.
 */
export default function PortaalNietGevonden() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-beeldmerk.svg" alt="" width={30} height={30} />
        <span className="text-base font-extrabold tracking-[0.06em]">EVERTS.</span>
      </div>

      <h1 className="text-2xl font-bold">Deze pagina bestaat niet</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Mogelijk is de link verouderd, of is dit project niet (meer) met u gedeeld.
      </p>

      <Link
        href="/portaal"
        className="mt-6 inline-block w-fit rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
      >
        Naar uw projecten
      </Link>
    </div>
  )
}
