import { PageHeader, Card, CardBody } from '@/components/ui'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'
import { vereisHandboekBeheerPagina } from '@/lib/handboek/auth'
import {
  haalBeheerBijlagen, haalBeheerContacten, haalBeheerHandboek, haalKiesbareMedewerkers,
  haalPopulatie, haalWerkmaatschappijKenmerken,
} from '@/lib/handboek/beheer'
import HandboekBeheer from '@/components/handboek/beheer/HandboekBeheer'

export const metadata = { title: 'Medewerkershandboek' }
export const dynamic = 'force-dynamic'

/**
 * Beheer van het medewerkershandboek.
 *
 * Leest met de admin-client (zie lib/handboek/beheer.ts): de beheerder moet ook
 * de concepten zien en de tekst die voor hemzelf verborgen is — anders kan
 * iemand van kantoor de flextekst niet bewerken.
 */
export default async function Page() {
  await vereisHandboekBeheerPagina('lezen')

  const [secties, bijlagen, contacten, medewerkers, werkmaatschappijen, populatie] =
    await Promise.all([
      haalBeheerHandboek(),
      haalBeheerBijlagen(),
      haalBeheerContacten(),
      haalKiesbareMedewerkers(),
      haalWerkmaatschappijKenmerken(),
      haalPopulatie(),
    ])

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Organisatie" title="Medewerkershandboek" />
      <p className="eva-page-desc -mt-[14px] mb-[22px]">
        De hoofdstukken, de &ldquo;Wat te doen bij&hellip;&rdquo;-kaarten en de bijlagen die
        medewerkers op hun telefoon lezen. Per hoofdstuk én per alinea bepaal je wie het te zien
        krijgt, zodat eigen personeel en flexkrachten uit dezelfde bron lezen.
      </p>

      <Card>
        <CardBody>
          <HandboekBeheer
            hoofdstukken={secties.filter((s) => s.soort === 'hoofdstuk')}
            situaties={secties.filter((s) => s.soort === 'situatie')}
            bijlagen={bijlagen}
            contacten={contacten}
            medewerkers={medewerkers}
            werkmaatschappijen={werkmaatschappijen}
            populatie={populatie.groepen}
            totaal={populatie.totaal}
          />
        </CardBody>
      </Card>
    </div>
  )
}
