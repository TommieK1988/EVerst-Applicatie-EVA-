import { vereisHandboekLezer } from '@/lib/handboek/auth'
import { haalBijlagen, haalHoofdstukken, haalSituaties, haalZoekIndex } from '@/lib/handboek/inhoud'
import AppHeader from '@/components/mobiel/AppHeader'
import HandboekOverzicht from '@/components/handboek/mobiel/HandboekOverzicht'

export const metadata = { title: 'Handboek' }

/**
 * De inhoud hangt af van wie er kijkt (RLS leest `handboek_kenmerken()` van de
 * ingelogde gebruiker), dus dit scherm mag nooit als statische pagina gedeeld
 * worden tussen gebruikers.
 */
export const dynamic = 'force-dynamic'

/**
 * Het handboek op de telefoon.
 *
 * Alles wat hier binnenkomt is al door RLS gefilterd op de kenmerken van deze
 * medewerker: een flexkracht krijgt de hoofdstukken die niet voor hem zijn
 * simpelweg niet terug, en de zoekindex wordt uit diezelfde gegevens gebouwd.
 * Er staat dus geen verborgen tekst in de HTML om client-side weg te filteren.
 */
export default async function MobielHandboekPage() {
  await vereisHandboekLezer()

  const [hoofdstukken, situaties, bijlagen, index] = await Promise.all([
    haalHoofdstukken(),
    haalSituaties(),
    haalBijlagen(),
    haalZoekIndex(),
  ])

  const kort = (s: (typeof hoofdstukken)[number]) => ({
    slug: s.slug,
    titel: s.titel,
    samenvatting: s.samenvatting,
    icoon: s.icoon,
  })

  return (
    <>
      <AppHeader title="Handboek" sub="Afspraken en wat te doen bij…" backHref="/m" />
      <HandboekOverzicht
        index={index}
        situaties={situaties.map(kort)}
        hoofdstukken={hoofdstukken.map(kort)}
        bijlagen={bijlagen}
      />
    </>
  )
}
