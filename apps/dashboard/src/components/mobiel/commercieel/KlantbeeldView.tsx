'use client'

/**
 * Het klantbeeld: alles over één opdrachtgever, in de volgorde waarin je het aan de telefoon
 * nodig hebt.
 *
 * Van boven naar beneden: hoe bereik ik ze, wat zijn ze ons waard, waar moet ik op letten, en
 * dan pas de lijsten. De drie blokken over lopend geld (openstaande offertes, wat er in de
 * maak is, wat er loopt) staan open; de rest start dicht — anders is het scherm een
 * scrollmarathon bij een klant met honderd dossiers.
 *
 * De blok-ids (`blok-offertes-open`, `blok-facturen`) zijn de scrolldoelen van
 * `SignalenBalk`; hernoem je er een, hernoem hem daar ook.
 */

import React from 'react'
import type { Klantbeeld } from '@/lib/commercie/klantbeeld-types'
import type { RelatieNotitie } from '@/lib/relaties/notities-types'
import { onthoudKlant } from './recent'
import ContactKnoppen from './ContactKnoppen'
import KengetallenRij from './KengetallenRij'
import SignalenBalk from './SignalenBalk'
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
      <SignalenBalk signalen={signalen} />

      <div style={{ padding: '18px 16px 16px' }}>
        <KlapBlok
          id="blok-offertes-open"
          titel="Openstaande offertes"
          aantal={beeld.offertesOpen.length}
          standaardOpen
          leegTekst="Er staat nu niets open bij deze klant."
        >
          {beeld.offertesOpen.map(d => <DossierRegel key={d.id} dossier={d} />)}
        </KlapBlok>

        <KlapBlok
          titel="Offertes in de maak"
          aantal={beeld.offertesInDeMaak.length}
          standaardOpen
          leegTekst="We zijn nu niets aan het uitwerken."
        >
          {beeld.offertesInDeMaak.map(d => <DossierRegel key={d.id} dossier={d} />)}
        </KlapBlok>

        <KlapBlok
          titel="Lopend werk"
          aantal={beeld.lopendWerk.length}
          standaardOpen
          leegTekst="Er loopt op dit moment geen werk."
        >
          {beeld.lopendWerk.map(d => <DossierRegel key={d.id} dossier={d} />)}
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
            standaardOpen
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
            <DossierRegel key={d.id} dossier={d} toonBedrag toonJaar />
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
        relatieId={relatie.id}
        relatieNaam={relatie.naam}
        contactpersonen={beeld.contactpersonen.map(c => ({ id: c.id, naam: c.naam }))}
        medewerkers={medewerkers}
        currentMedewerkerId={currentMedewerkerId}
        magNotitie={magSchrijven}
        magVerkoopkans={magVerkoopkans}
      />
    </>
  )
}
