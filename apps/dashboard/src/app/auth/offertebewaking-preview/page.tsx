'use client'

/**
 * Voorbeeldpagina van "Te doen" (offertebewaking), met verzonnen gegevens.
 *
 * WAAROM DIT BESTAAT
 * Het echte scherm zit achter een login en hangt van levende offertes af. Of een kolom afkapt,
 * de stippen kloppen of het paneel naast de lijst past, vangt geen type-check. Deze pagina
 * rendert dezelfde componenten (TeDoenTegels, TeDoenLijst, OfferteKaart) met verzonnen gegevens,
 * zodat je de opmaak zonder sessie kunt nakijken. Bereikbaar zonder in te loggen omdat
 * `middleware.ts` alles onder `/auth/` overslaat.
 *
 * Vastleggen doet hier niets zinnigs: daarvoor is een sessie nodig. Dit is om naar te kíjken.
 */

import * as React from 'react'
import { DialoogProvider } from '@/components/ui/dialogen'
import type { DossierRij } from '@/components/dossiers/types'
import type { OffertePaneelData } from '@/lib/commercie/paneel'
import type { BewakingKaart } from '@/lib/commercie/types'
import { maakTeDoenRij, sorteerTeDoen, type Bak, type LaatsteContact } from '@/components/commercie/te-doen'
import { TeDoenLijst, TeDoenTegels } from '@/components/commercie/TeDoenLijst'
import { OfferteKaart } from '@/components/commercie/OfferteKaart'
import { BedragFilter } from '@/components/commercie/BedragFilter'
import { STANDAARD_KLASSEN } from '@/lib/commercie/bedragklassen'

const VANDAAG = '2026-10-15'
const BAS = 'mw-bas'
const SANNE = 'mw-sanne'

type Voorbeeld = {
  id: string; titel: string; klant: string; nr: string; bedrag: number; verzonden: string
  contact: [string, string]; eigenaar: string; houder: string | null; houderNaam: string | null
  soort: 'actie' | 'wachten' | null; tekst: string | null; datum: string | null; wachtOp?: 'klant' | 'intern' | 'extern'
}

const VOORBEELDEN: Voorbeeld[] = [
  { id: 'd1', titel: 'Schilderwerk buitenzijde 2027', klant: 'VvE Parkzicht, Rijswijk', nr: 'D-26-0412', bedrag: 48_200, verzonden: '2026-09-04', contact: ['M. Verbeek', '06 41 22 87 90'], eigenaar: BAS, houder: BAS, houderNaam: 'Bas', soort: 'actie', tekst: 'Nabellen na uitslag ALV', datum: '2026-10-13' },
  { id: 'd2', titel: 'Houtrotherstel kozijnen complex 412', klant: 'Haag Wonen', nr: 'D-26-0398', bedrag: 21_750, verzonden: '2026-09-22', contact: ['R. Ouali', '070 312 44 10'], eigenaar: BAS, houder: SANNE, houderNaam: 'Sanne', soort: 'actie', tekst: 'Navragen of versie 2 is doorgezet', datum: '2026-10-15' },
  { id: 'd3', titel: 'Brandwerende deuren vervangen', klant: 'Zorgcentrum Duinrust', nr: 'D-26-0455', bedrag: 67_900, verzonden: '2026-10-12', contact: ['J. Smits', '070 205 66 31'], eigenaar: '', houder: null, houderNaam: null, soort: null, tekst: null, datum: null },
  { id: 'd4', titel: 'Gevelonderhoud en voegwerk', klant: 'VvE Laan van Meerdervoort 210', nr: 'D-26-0371', bedrag: 12_400, verzonden: '2026-09-01', contact: ['P. de Wit', '06 28 45 19 03'], eigenaar: BAS, houder: SANNE, houderNaam: 'Sanne', soort: 'wachten', tekst: 'Penningmeester stuurt akkoord', datum: '2026-10-20', wachtOp: 'klant' },
  { id: 'd5', titel: 'Dakrenovatie plat dak', klant: 'VvE De Kroonvogel, Delft', nr: 'D-26-0333', bedrag: 138_500, verzonden: '2026-06-25', contact: ['A. Kok (VvE Beheer Delfland)', '015 214 70 02'], eigenaar: BAS, houder: BAS, houderNaam: 'Bas', soort: 'wachten', tekst: 'Besluit voorjaars-ALV', datum: '2026-10-28', wachtOp: 'klant' },
  { id: 'd6', titel: 'Kunststof kozijnen achtergevel', klant: 'Fam. de Groot, Voorburg', nr: 'D-26-0449', bedrag: 8_900, verzonden: '2026-10-08', contact: ['E. de Groot', '06 55 10 72 64'], eigenaar: BAS, houder: BAS, houderNaam: 'Bas', soort: 'actie', tekst: 'Offerte toelichten', datum: '2026-10-16' },
  { id: 'd7', titel: 'Groot onderhoud portiekflats', klant: 'Vidomes, Delft', nr: 'D-26-0389', bedrag: 27_400, verzonden: '2026-09-10', contact: ['D. Pranoto', '015 750 30 84'], eigenaar: BAS, houder: BAS, houderNaam: 'Bas', soort: 'actie', tekst: 'Opdracht formeel rondmaken', datum: '2026-10-19' },
  { id: 'd9', titel: 'Vervangen entreepartij', klant: 'VvE Buitenhof, Delft', nr: 'D-26-0437', bedrag: 14_200, verzonden: '2026-09-29', contact: ['A. Kok (VvE Beheer Delfland)', '015 214 70 02'], eigenaar: SANNE, houder: SANNE, houderNaam: 'Sanne', soort: 'actie', tekst: 'Navragen of het bestuur akkoord is', datum: '2026-10-22' },
  { id: 'd8', titel: 'Betonherstel galerijen', klant: 'VvE Waldeck', nr: 'D-26-0418', bedrag: 19_800, verzonden: '2026-09-18', contact: ['T. Vos (Ingenieursbureau Kruit)', '070 360 12 12'], eigenaar: BAS, houder: BAS, houderNaam: 'Bas', soort: 'wachten', tekst: 'Adviseur toetst aan bestek', datum: '2026-11-21', wachtOp: 'extern' },
]

const CONTACTEN: Record<string, LaatsteContact> = {
  d1: { op: '2026-09-29T10:00:00Z', door: 'Bas', kop: 'Ligt bij ALV of bestuur' },
  d2: { op: '2026-10-08T10:00:00Z', door: 'Sanne', kop: 'Klant komt erop terug' },
  d4: { op: '2026-10-05T10:00:00Z', door: 'Sanne', kop: 'Klant komt erop terug' },
  d5: { op: '2026-10-02T10:00:00Z', door: 'Bas', kop: 'Ligt bij ALV of bestuur' },
  d6: { op: '2026-10-13T10:00:00Z', door: 'Bas', kop: 'Geen gehoor' },
  d7: { op: '2026-10-12T10:00:00Z', door: 'Bas', kop: 'Waarschijnlijk opdracht' },
}

function naarDossier(v: Voorbeeld): DossierRij {
  return {
    id: v.id, titel: v.titel, dossiernummer: v.nr, klant_naam: v.klant, hoofdstatus: 'offerte',
    offerte_substatus: v.soort === 'wachten' ? 'in_behandeling' : v.soort ? 'nabellen' : 'verzonden',
    bedrag_excl_btw: v.bedrag, verzonden_op: `${v.verzonden}T09:00:00Z`,
    contactpersoon_naam: v.contact[0], contactpersoon_telefoon: v.contact[1], contactpersoon_email: null,
    bewaking_actief: true, bewaking_stap_soort: v.soort, bewaking_stap_tekst: v.tekst,
    bewaking_stap_datum: v.datum, bewaking_wacht_op: v.wachtOp ?? null, bewaking_stap_bron: 'handmatig',
    bewaking_actiehouder: v.houderNaam, bewaking_actiehouder_id: v.houder,
    bewaking_eigenaar_id: v.eigenaar || null, intern: false,
  } as unknown as DossierRij
}

function paneelData(v: Voorbeeld): OffertePaneelData {
  const kaart: BewakingKaart | null = v.soort ? {
    id: `k-${v.id}`, dossier_id: v.id, soort: 'offerte', titel: null,
    eigenaar_id: v.eigenaar || null, actiehouder_id: v.houder,
    stap_soort: v.soort, stap_tekst: v.tekst, stap_datum: v.datum, wacht_op: v.wachtOp ?? null,
    kans_pct: null, verwachte_opdracht: null, getrieerd_op: '2026-09-10', stap_bron: 'handmatig', taak_id: null,
  } : null
  const rij = maakTeDoenRij(naarDossier(v), VANDAAG)
  const c = CONTACTEN[v.id]
  return {
    bewaking: {
      kaart, status: rij._status, eigenaarNaam: v.eigenaar === BAS ? 'Bas' : null,
      actiehouderNaam: v.houderNaam, vandaag: VANDAAG, afgerond: false, fase: null,
    },
    tijdlijn: c ? [{
      id: 't1', op: c.op, soort: 'contact', kop: c.kop, door: c.door,
      tekst: v.id === 'd4'
        ? 'Penningmeester gesproken. Bestuur is akkoord, hij stuurt de getekende offerte vóór 20 okt terug. Niet eerder bellen.'
        : 'Voorzitter gesproken, staat als agendapunt op de vergadering.',
    }, {
      id: 't0', op: `${v.verzonden}T09:00:00Z`, soort: 'fase', kop: 'Verzonden', door: null, tekst: null,
    }] : [],
    geldigTot: v.id === 'd5' ? '2026-09-25' : '2026-12-15',
    versie: 1,
    heeftPdf: true,
  }
}

export default function OffertebewakingPreview() {
  const [tegel, setTegel] = React.useState<Bak | null>(null)
  const [klassen, setKlassen] = React.useState(STANDAARD_KLASSEN)
  const [geopend, setGeopend] = React.useState<string | null>('d5')
  const alleOngefilterd = React.useMemo(() => VOORBEELDEN.map(v => maakTeDoenRij(naarDossier(v), VANDAAG)), [])
  const alle = alleOngefilterd.filter(r => klassen[r._klasse])
  const zichtbaar = alle.filter(r => (tegel ? r._bak === tegel : true)).sort(sorteerTeDoen)
  const aantallen = { mega: 0, groot: 0, middel: 0, klein: 0 }
  for (const r of alleOngefilterd) aantallen[r._klasse]++
  const contacten = React.useMemo(() => new Map(Object.entries(CONTACTEN)), [])
  const v = VOORBEELDEN.find(x => x.id === geopend) ?? null

  return (
    <DialoogProvider>
      <div className="min-h-screen bg-neutral-50">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4">
          <p className="text-xs text-neutral-500">
            Voorbeeld met verzonnen gegevens · vandaag = 15 okt 2026 · ingelogd als Bas
          </p>
          <BedragFilter klassen={klassen} onKlassen={setKlassen} aantallen={aantallen} min={null} max={null} onBereik={() => {}} />
          <TeDoenTegels alleRijen={alle} tegel={tegel} onTegel={setTegel} />
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <TeDoenLijst
              rijen={zichtbaar}
              alleRijen={alle}
              tegel={tegel}
              onTegel={setTegel}
              geopendId={geopend}
              onOpen={setGeopend}
              mijnMedewerkerId={BAS}
              laatsteContact={contacten}
              vandaag={VANDAAG}
            />
            <aside className="rounded-[10px] border border-neutral-200 bg-white">
              {v ? (
                <OfferteKaart
                  dossier={naarDossier(v)}
                  data={paneelData(v)}
                  mijnMedewerkerId={BAS}
                  medewerkers={[{ id: BAS, naam: 'Bas' }, { id: SANNE, naam: 'Sanne' }]}
                  vandaag={VANDAAG}
                  onVastgelegd={() => {}}
                  onOpen={setGeopend}
                  // Kroonvogel en Buitenhof hebben dezelfde beheerder: zo ziet het blok "Ook open bij" eruit.
                  overige={v.id === 'd5' || v.id === 'd9'
                    ? { partij: 'VvE Beheer Delfland', rijen: alleOngefilterd.filter(r => r.id === (v.id === 'd5' ? 'd9' : 'd5')) }
                    : undefined}
                  kop={
                    <div className="border-b border-neutral-200 px-4 py-3">
                      <h2 className="text-[15px] font-bold leading-5 text-neutral-900">{v.titel}</h2>
                      <p className="mt-0.5 text-xs text-neutral-500">{v.klant} · {v.nr}</p>
                    </div>
                  }
                />
              ) : <p className="p-4 text-sm text-neutral-500">Kies een offerte.</p>}
            </aside>
          </div>
        </div>
      </div>
    </DialoogProvider>
  )
}
