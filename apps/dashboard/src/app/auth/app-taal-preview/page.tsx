import React from 'react'
import { Noto_Sans_Tamil } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { ListChecks, FolderOpen, Clock, CalendarDays, User, Palmtree, BookOpen, Timer } from 'lucide-react'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielTegel from '@/components/mobiel/MobielTegel'
import MobielTakenLijst, { type MobielTaak } from '@/components/mobiel/MobielTakenLijst'
import VerlofClient from '@/components/mobiel/uren/VerlofClient'
import ProjectZoekerVoorbeeld from './ProjectZoekerVoorbeeld'
import TaalKeuze from '@/components/mobiel/TaalKeuze'
import MedewerkerGegevensBlok from '@/components/mobiel/MedewerkerGegevensBlok'
import MobielUpdates from '@/components/mobiel/MobielUpdates'
import type { MobielUpdate } from '@/lib/mobiel/updates'
import { laadBerichten } from '@/i18n/berichten'
import { naarTaal, TALEN, TAAL_NAAM, TIJDZONE } from '@/i18n/talen'
import type { VerlofAanvraag } from '@/lib/uren/verlof'
import type { IngeplandVerlof } from '@/lib/uren/afwezigheid-mobiel'
import type { EigenGegevens } from '@/lib/medewerker/eigen-gegevens'

/**
 * Voorbeeld van EVA Mobiel in elke taal, met verzonnen gegevens: `/auth/app-taal-preview?taal=ta`.
 *
 * WAAROM DIT BESTAAT
 * Pools is 20–30% en Tamil 30–50% langer dan Nederlands. Of een knop, tegel of label dan nog
 * past, vangt geen type-check of test — dat moet je zien. De echte app zit achter een login en
 * een medewerker met de juiste taal; dit scherm toont de échte componenten (geen namaak) zonder
 * dat allemaal. Bereikbaar zonder in te loggen omdat `middleware.ts` alles onder `/auth/`
 * overslaat. Knoppen doen niets zinnigs: de server-acties erachter hebben een sessie nodig.
 *
 * Teksten van kantoor (taakomschrijvingen e.d.) worden hier niet vertaald: daarvoor is een
 * ingelogde medewerker nodig. Ze staan er in het Nederlands, zoals in de app tijdens het laden.
 */

const notoTamil = Noto_Sans_Tamil({ subsets: ['tamil'], variable: '--font-noto-tamil', display: 'swap', preload: false })

export const metadata = { title: 'App-taal voorbeeld' }

const vandaag = new Date()
const dag = (n: number) => new Date(vandaag.getTime() + n * 86_400_000).toISOString().slice(0, 10)

const TAKEN: MobielTaak[] = [
  { id: 't1', titel: 'Steiger opbouwen voorgevel', deadline: dag(0), prioriteit: 'hoog', dossier_naam: 'Kerkstraat 12, Zwolle', dossier_id: 'd1', formulier_template_id: null, omschrijving: 'Let op: stoep vrijhouden voor voetgangers.' },
  { id: 't2', titel: 'Kozijnen schuren en gronden', deadline: dag(2), prioriteit: 'normaal', dossier_naam: 'VvE De Linde', dossier_id: 'd2', formulier_template_id: 'f1', omschrijving: null },
  { id: 't3', titel: 'Toolbox: werken op hoogte', deadline: dag(-1), prioriteit: 'laag', dossier_naam: null, dossier_id: null, formulier_template_id: null, toolbox_toewijzing_id: 'tb1', omschrijving: null },
]

const VERLOF: VerlofAanvraag[] = [
  {
    id: 'v1', medewerkerNaam: 'Kasun Perera', uursoortId: 'u1', uursoortNaam: 'Vakantie',
    startDatum: dag(14), eindDatum: dag(18), heleDagen: true, startTijd: null, eindTijd: null,
    urenTotaal: 40, toelichting: null, status: 'aangevraagd', beoordelaarNaam: null,
    afwijzingReden: null, bouw7Status: 'nieuw', aangevraagdOp: dag(-2),
  },
  {
    id: 'v2', medewerkerNaam: 'Kasun Perera', uursoortId: 'u2', uursoortNaam: 'Bijzonder verlof',
    startDatum: dag(-20), eindDatum: dag(-20), heleDagen: false, startTijd: '13:00', eindTijd: '17:00',
    urenTotaal: 4, toelichting: 'Tandarts', status: 'afgewezen', beoordelaarNaam: 'Jan de Vries',
    afwijzingReden: 'Die middag is de oplevering.', bouw7Status: 'nieuw', aangevraagdOp: dag(-25),
  },
]

// Verlof dat kantoor in Bouw7 zette: staat in de planning, niet als aanvraag.
const INGEPLAND: IngeplandVerlof[] = [
  { id: 'a1', type: 'verlof', startDatum: dag(35), eindDatum: dag(46), startTijd: null, eindTijd: null, opmerking: 'Zomervakantie' },
]

const GEGEVENS: EigenGegevens = {
  email: 'k.perera@voorbeeld.nl', telefoon: '06-12345678', geboortedatum: '1991-03-14',
  adres_straat: 'Kerkstraat 12', adres_postcode: '8011 AB', adres_plaats: 'Zwolle',
  // Zoals in Bouw7: vrije tekst, soms twee contacten over meerdere regels.
  noodcontact: 'Nirmala Perera (echtgenote)\n06-98765432\nRavi Perera (broer) 06-11223344',
  functie: 'Schilder', afdeling: 'Uitvoering', ploeg: 'Ploeg Noord', in_dienst_vanaf: '2019-09-01',
  rooster: {
    werkdagen: [1, 2, 3, 4, 5], dagstart: '07:30:00', dageind: '16:00:00', contracturen_per_week: 37.5,
    pauzes: [{ start: '10:00:00', eind: '10:15:00' }, { start: '12:30:00', eind: '13:00:00' }],
  },
  bedrijfsmiddelen: [],
  vca: null,
}

/** `?updates=1` toont het "Nieuw in EVA Mobiel"-paneel van het startscherm. */
const UPDATES: MobielUpdate[] = [
  { id: 'c1', datum: '2026-10-05', categorie: 'opgelost', titel: 'Houtrotreparaties vastleggen werkt weer',
    omschrijving: 'Je kunt weer een houtrotreparatie opslaan. Bij een reparatie kies je nu ook een foto uit je galerij.' },
  { id: 'c2', datum: '2026-10-04', categorie: 'verbeterd', titel: 'Projecten zoeken bij uren',
    omschrijving: 'Bij het schrijven van uren zie je alleen je ingeplande projecten en kun je zoeken in plaats van scrollen.' },
]

export default async function AppTaalPreview({ searchParams }: { searchParams: Promise<{ taal?: string; updates?: string }> }) {
  const params = await searchParams
  const taal = naarTaal(params.taal)
  const berichten = await laadBerichten(taal)
  const t = await getTranslations({ locale: taal, namespace: 'home' })

  return (
    <NextIntlClientProvider locale={taal} messages={berichten} timeZone={TIJDZONE}>
      <div
        className={`eva ${notoTamil.variable}`}
        data-theme="light"
        lang={taal}
        style={{
          maxWidth: 390, margin: '0 auto', minHeight: '100dvh', background: 'var(--bg)',
          fontFamily: "'Montserrat', var(--font-noto-tamil), ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', gap: 8, padding: 8, background: '#111', flexWrap: 'wrap' }}>
          {TALEN.map((l) => (
            <a key={l} href={`?taal=${l}${params.updates === '1' ? '&updates=1' : ''}`} style={{ color: l === taal ? '#7ee2a8' : '#fff', fontSize: 13, fontWeight: 700 }}>
              {TAAL_NAAM[l]}
            </a>
          ))}
        </div>
        <AppHeader title="EVA" sub={t('welkom', { naam: 'Kasun' })} ongelezenMeldingen={3} />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <MobielTegel href="#" label={t('tegel.acties')} Icon={ListChecks} badge={3} />
          <MobielTegel href="#" label={t('tegel.dossiers')} Icon={FolderOpen} />
          <MobielTegel href="#" label={t('tegel.prikklok')} Icon={Timer} />
          <MobielTegel href="#" label={t('tegel.uren')} Icon={Clock} />
          <MobielTegel href="#" label={t('tegel.planning')} Icon={CalendarDays} />
          <MobielTegel href="#" label={t('tegel.verlof')} Icon={Palmtree} />
          <MobielTegel href="#" label={t('tegel.handboek')} Icon={BookOpen} />
          <MobielTegel href="#" label={t('tegel.mijnGegevens')} Icon={User} />
        </div>
        <MobielTakenLijst taken={TAKEN} />
        <VerlofClient aanvragen={VERLOF} ingepland={INGEPLAND} soorten={[{ id: 'u1', naam: 'Vakantie' }, { id: 'u2', naam: 'Bijzonder verlof' }]} saldo={86.5} />
        <div style={{ padding: 16 }}><ProjectZoekerVoorbeeld /></div>
        <div style={{ padding: 16, display: 'grid', gap: 12 }}><MedewerkerGegevensBlok gegevens={GEGEVENS} /></div>
        <div style={{ padding: 16 }}><TaalKeuze /></div>
        {params.updates === '1' && <MobielUpdates items={UPDATES} />}
      </div>
    </NextIntlClientProvider>
  )
}
