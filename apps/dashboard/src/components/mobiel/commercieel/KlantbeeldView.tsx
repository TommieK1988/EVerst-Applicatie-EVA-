'use client'

/**
 * Het klantbeeld: alles over één opdrachtgever, in de volgorde waarin je het aan de telefoon
 * nodig hebt.
 *
 * Van boven naar beneden: hoe bereik ik ze, wat zijn ze ons waard, waar moet ik op letten, en
 * dan pas de lijsten. Alle blokken starten dicht: je ziet in één scherm wát er is — tien
 * koppen met een aantal — en klapt open waar het gesprek heen gaat. Bij een klant met honderd
 * dossiers is dat het verschil tussen een overzicht en een scrollmarathon.
 *
 * Omdat ze dicht staan, opent een chip in de signalenbalk zijn doelblok via `openVerzoek` —
 * een teller per blok. Scrollen alleen zou je bij een dichte kop afleveren.
 *
 * Bij de openstaande offertes staat het offertebedrag excl. btw én — als er een offerte te
 * vinden is — een knop die hem als PDF opent. Dat is wat de klant aan de telefoon vraagt:
 * "waar ging die offerte ook alweer over, en om welk bedrag?"
 */

import React from 'react'
import type { Klantbeeld } from '@/lib/commercie/klantbeeld-types'
import type { RelatieNotitie } from '@/lib/relaties/notities-types'
import { onthoudKlant } from './recent'
import ContactKnoppen from './ContactKnoppen'
import KengetallenRij from './KengetallenRij'
import SignalenBalk, { type SignaalBlok } from './SignalenBalk'
import KlapBlok from './KlapBlok'
import DossierRegel from './DossierRegel'
import FactuurRegel, { factuurTotaal } from './FactuurRegel'
import ContactLijst from './ContactLijst'
import NotitieLijst from './NotitieLijst'
import VastleggenSheet from './VastleggenSheet'
import { GRIJS, OPPERVLAK, RAND, TEKST } from './stijl'

export default function KlantbeeldView({
  beeld, notities, currentMedewerkerId, magSchrijven, magVerkoopkans, medewerkers,
}: {
  beeld: Klantbeeld
  notities: RelatieNotitie[]
  currentMedewerkerId: string | null
  /** Recht `relaties` op schrijven — draagt notities. */
  magSchrijven: boolean
  /** Recht `dossiers` op schrijven — draagt de verkoopkans. */
  magVerkoopkans: boolean
  /** `authUserId` is nodig om een actie toe te wijzen; zonder account kan dat niet. */
  medewerkers: { id: string; naam: string; authUserId: string | null }[]
}) {
  const { relatie, kengetallen, score, signalen } = beeld

  // Waar de terugknop van een geopend dossier heen moet: hierheen, niet naar de dossierlijst.
  const terugNaar = `/m/commercieel/${relatie.id}`

  // Hoe vaak een signaalchip om welk blok vroeg. Ophogen is het signaal, niet de waarde zelf —
  // zo werkt dezelfde chip ook de tweede keer, nadat je het blok weer had dichtgeklapt.
  const [verzoek, setVerzoek] = React.useState<Record<SignaalBlok, number>>({
    facturen: 0, offertesOpen: 0,
  })
  const vraagOpen = (blok: SignaalBlok) =>
    setVerzoek(v => ({ ...v, [blok]: v[blok] + 1 }))

  // Deze klant bovenaan "recent geopend" zetten. In een effect omdat localStorage pas na
  // hydratatie bestaat.
  React.useEffect(() => {
    onthoudKlant({ id: relatie.id, naam: relatie.naam, plaats: relatie.plaats })
  }, [relatie.id, relatie.naam, relatie.plaats])

  return (
    <>
      <ContactKnoppen
        telefoon={relatie.telefoon}
        email={relatie.email}
        adres={relatie.adres}
      />

      <KengetallenRij kengetallen={kengetallen} score={score} />
      <SignalenBalk signalen={signalen} onOpen={vraagOpen} />

      <div style={{ padding: '18px 16px 16px' }}>
        <KlapBlok
          id="blok-offertes-open"
          // De btw-basis staat één keer in de kop; achter elk bedrag zou hij de titel van de
          // offerte wegdrukken, en dat is juist wat je op de regel wilt lezen.
          titel="Openstaande offertes · excl. btw"
          aantal={beeld.offertesOpen.length}
          openVerzoek={verzoek.offertesOpen}
          leegTekst="Er staat nu niets open bij deze klant."
        >
          {beeld.offertesOpen.map(d => (
            <DossierRegel
              key={d.id}
              dossier={d}
              terugNaar={terugNaar}
              // Het offertebedrag, niet de gefactureerde omzet: die bestaat hier nog niet.
              bedrag={d.bedragExclBtw}
              pdfHref={d.offerteDocument ? `/api/dossiers/${d.id}/offerte/pdf` : null}
              pdfLabel={d.offerteDocument}
            />
          ))}
        </KlapBlok>

        <KlapBlok
          titel="Offertes in de maak"
          aantal={beeld.offertesInDeMaak.length}
          leegTekst="We zijn nu niets aan het uitwerken."
        >
          {beeld.offertesInDeMaak.map(d => <DossierRegel key={d.id} dossier={d} terugNaar={terugNaar} />)}
        </KlapBlok>

        {/* Eerder één blok "Lopend werk". Bij een vastgoedbeheerder zijn dat er al gauw
            veertig, en dan staat een renovatie van een ton tussen de lekkagemeldingen. Twee
            blokken, omdat het twee gesprekken zijn — en omdat de servicedeskbonnen bijna altijd
            de lange lijst vormen die het andere blok onleesbaar maakte. */}
        <KlapBlok
          titel="Opdrachten"
          aantal={beeld.opdrachten.length}
          leegTekst="Er loopt op dit moment geen opdracht."
        >
          {beeld.opdrachten.map(d => <DossierRegel key={d.id} dossier={d} terugNaar={terugNaar} />)}
        </KlapBlok>

        <KlapBlok
          titel="Servicedesk"
          aantal={beeld.servicedesk.length}
          leegTekst="Er staat geen servicedeskwerk open."
        >
          {beeld.servicedesk.map(d => <DossierRegel key={d.id} dossier={d} terugNaar={terugNaar} />)}
        </KlapBlok>

        {/* Zonder het recht `financieel` verschijnt dit blok niet — geen lege kaart die
            suggereert dat er niets open staat. */}
        {beeld.toontFacturen && (
          <KlapBlok
            id="blok-facturen"
            titel={
              beeld.facturen.length > 0
                ? `Open facturen · ${factuurTotaal(beeld.facturen)}`
                : 'Open facturen'
            }
            aantal={beeld.facturen.length}
            openVerzoek={verzoek.facturen}
            leegTekst="Alles is betaald."
          >
            {beeld.facturen.map(f => <FactuurRegel key={f.id} factuur={f} />)}
          </KlapBlok>
        )}

        <KlapBlok
          titel={`Uitgevoerd werk ${beeld.uitgevoerdVanafJaar}–${kengetallen.ditJaar}`}
          aantal={beeld.uitgevoerd.length}
          leegTekst="Geen afgerond werk in deze periode."
        >
          {beeld.uitgevoerd.map(d => (
            <DossierRegel key={d.id} dossier={d} toonBedrag toonJaar terugNaar={terugNaar} />
          ))}
        </KlapBlok>

        {/* Stond eerder tussen het uitgevoerde werk, omdat `fase` beide "afgesloten" noemt.
            Bij een klant met 28 verloren offertes op 31 dossiers las dat als een lijst van
            wat we voor hem gedaan hebben. Geen bedrag op de regel: bij een niet-doorgegane
            offerte is de gefactureerde omzet leeg, en het offertebedrag erbij halen kost een
            tweede leesronde voor een lijst die je zelden opent. Het woord "offertes" staat
            niet in de kop: met het jaartal erbij brak hij op een telefoon over twee regels,
            en dan is dit de enige kop die twee keer zo hoog is als de rest. */}
        <KlapBlok
          titel={`Vervallen/afgewezen ${beeld.uitgevoerdVanafJaar}–${kengetallen.ditJaar}`}
          aantal={beeld.nietDoorgegaan.length}
          leegTekst="Alles is doorgegaan in deze periode."
        >
          {beeld.nietDoorgegaan.map(d => (
            <DossierRegel key={d.id} dossier={d} toonJaar terugNaar={terugNaar} />
          ))}
        </KlapBlok>

        <KlapBlok
          titel="Objecten"
          aantal={beeld.objecten.length}
          leegTekst="Geen werk aan een specifiek object vastgelegd."
        >
          {beeld.objecten.map(o => (
            <div
              key={o.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 12px', borderRadius: 12,
                background: OPPERVLAK, border: `1px solid ${RAND}`, marginBottom: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: TEKST,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {o.naam}
                </div>
                {o.adres && (
                  <div style={{
                    fontSize: 12.5, color: GRIJS, marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {o.adres}
                  </div>
                )}
              </div>
              <span style={{ flexShrink: 0, fontSize: 12.5, color: GRIJS, fontWeight: 600 }}>
                {o.aantalDossiers}×
              </span>
            </div>
          ))}
        </KlapBlok>

        <KlapBlok
          titel="Contactpersonen"
          aantal={beeld.contactpersonen.length}
          leegTekst="Nog geen contactpersonen vastgelegd."
        >
          <ContactLijst personen={beeld.contactpersonen} />
        </KlapBlok>

        <KlapBlok
          titel="Gespreksnotities"
          aantal={notities.length}
          leegTekst="Nog niets vastgelegd over deze klant."
        >
          <NotitieLijst
            notities={notities}
            currentMedewerkerId={currentMedewerkerId}
            magVerwijderen={magSchrijven}
          />
        </KlapBlok>
      </div>

      <VastleggenSheet
        relaties={[{ id: relatie.id, naam: relatie.naam }]}
        titelVoorvoegsel={relatie.naam}
        contactpersonen={beeld.contactpersonen.map(c => ({ id: c.id, naam: c.naam }))}
        medewerkers={medewerkers}
        currentMedewerkerId={currentMedewerkerId}
        magNotitie={magSchrijven}
        magVerkoopkans={magVerkoopkans}
      />
    </>
  )
}
