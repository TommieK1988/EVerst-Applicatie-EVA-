'use client'

/**
 * De kaart van één contactpersoon: wie het is, hoe je hem bereikt, waar hij werkt, wat er op
 * zijn naam loopt en wat je met hém hebt besproken.
 *
 * Alles wat leeg is, blijft van het scherm. Dat is hier geen detail maar de hoofdregel: van de
 * 350 contactpersonen heeft er één een mobiel nummer, 137 een vast nummer en niemand een
 * privéveld ingevuld. Elk leeg veld tonen zou een scherm vol streepjes geven waarin je het
 * ene gevulde veld niet meer vindt.
 *
 * Privégegevens staan in een eigen, als zodanig benoemd blok. Dezelfde data als op de
 * desktoppagina en achter hetzelfde recht (`relaties`), maar apart gezet zodat je ze niet
 * ongemerkt in beeld hebt terwijl je iemand aan de lijn hebt.
 */

import React from 'react'
import Link from 'next/link'
import { Building2, Mail, Phone } from 'lucide-react'
import type { ContactpersoonBeeld } from '@/lib/commercie/contactpersoon-beeld'
import KlapBlok from './KlapBlok'
import DossierRegel from './DossierRegel'
import NotitieLijst from './NotitieLijst'
import VastleggenSheet from './VastleggenSheet'
import { GRIJS, OPPERVLAK, RAND, TEKST, lijstRij } from './stijl'

const GESLACHT_LABEL: Record<string, string> = {
  man: 'Man', vrouw: 'Vrouw', overig: 'Overig',
}

function Rij({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '7px 0',
      borderBottom: `1px solid ${RAND}`,
    }}>
      <span style={{ flex: '0 0 40%', fontSize: 12.5, color: GRIJS, fontWeight: 600 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: TEKST, wordBreak: 'break-word' }}>
        {waarde}
      </span>
    </div>
  )
}

/** Blok met rijen; rendert niets als er geen enkele rij gevuld is. */
function VeldBlok({ titel, rijen }: { titel: string; rijen: [string, string | null][] }) {
  const gevuld = rijen.filter((r): r is [string, string] => !!r[1])
  if (gevuld.length === 0) return null
  return (
    <div style={{
      background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14,
      padding: '4px 14px 10px', marginBottom: 14,
    }}>
      <div style={{
        fontSize: 11.5, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
        letterSpacing: '.04em', padding: '11px 0 4px',
      }}>
        {titel}
      </div>
      {gevuld.map(([label, waarde]) => <Rij key={label} label={label} waarde={waarde} />)}
    </div>
  )
}

function ContactKnop({
  href, label, Icon, uit,
}: {
  href: string | null
  label: string
  Icon: typeof Phone
  uit: boolean
}) {
  const stijl: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
    padding: '11px 6px', borderRadius: 12,
    background: OPPERVLAK, border: `1px solid ${RAND}`,
    color: uit ? GRIJS : TEKST, opacity: uit ? 0.45 : 1,
    fontSize: 12, fontWeight: 600, textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
  }
  const inhoud = <><Icon size={19} aria-hidden /><span>{label}</span></>
  if (uit || !href) return <div style={stijl} aria-disabled="true">{inhoud}</div>
  return <a href={href} style={stijl}>{inhoud}</a>
}

const telHref = (nummer: string | null): string | null =>
  nummer ? `tel:${nummer.replace(/[^\d+]/g, '')}` : null

export default function ContactpersoonView({
  beeld, currentMedewerkerId, magSchrijven, magVerkoopkans, medewerkers,
}: {
  beeld: ContactpersoonBeeld
  currentMedewerkerId: string | null
  /** Recht `relaties` op schrijven — draagt notities. */
  magSchrijven: boolean
  /** Recht `dossiers` op schrijven — draagt de verkoopkans. */
  magVerkoopkans: boolean
  /** `authUserId` is nodig om een actie toe te wijzen; zonder account kan dat niet. */
  medewerkers: { id: string; naam: string; authUserId: string | null }[]
}) {
  // Mobiel vóór vast: op het kantoornummer krijg je de receptie, op zijn mobiel hemzelf.
  const belNummer = beeld.mobiel || beeld.telefoon

  // Open je van hieruit een dossier, dan hoort de terugknop naar deze kaart te wijzen.
  const terugNaar = `/m/commercieel/cp/${beeld.id}`

  return (
    <>
      {!beeld.actief && (
        <div style={{
          margin: '14px 16px 0', padding: '10px 12px', borderRadius: 10,
          background: 'rgba(181,71,8,.08)', color: '#b54708',
          fontSize: 13, fontWeight: 600, lineHeight: 1.4,
        }}>
          Deze contactpersoon staat op inactief.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0' }}>
        <ContactKnop href={telHref(belNummer)} label="Bellen" Icon={Phone} uit={!belNummer} />
        <ContactKnop
          href={beeld.email ? `mailto:${beeld.email}` : null}
          label="Mailen" Icon={Mail} uit={!beeld.email}
        />
      </div>

      <div style={{ padding: '16px 16px 16px' }}>
        {/* Waar hij werkt — bovenaan, want dat is de brug naar het klantbeeld. */}
        {beeld.organisaties.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {beeld.organisaties.map(o => (
              <Link key={o.relatieId} href={`/m/commercieel/${o.relatieId}`} style={lijstRij}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={15} style={{ flexShrink: 0, color: GRIJS }} aria-hidden />
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: TEKST,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {o.naam}
                  </span>
                  {o.isPrimair && (
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: GRIJS }}>
                      primair
                    </span>
                  )}
                </div>
                {(o.functie || o.plaats) && (
                  <div style={{ fontSize: 12.5, color: GRIJS, marginTop: 3 }}>
                    {[o.functie, o.plaats].filter(Boolean).join(' · ')}
                  </div>
                )}
                {o.opmerkingen && (
                  <div style={{ fontSize: 12.5, color: GRIJS, marginTop: 3, fontStyle: 'italic' }}>
                    {o.opmerkingen}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        <VeldBlok
          titel="Bereikbaarheid"
          rijen={[
            ['E-mail', beeld.email],
            ['Mobiel', beeld.mobiel],
            ['Telefoon', beeld.telefoon],
            ['LinkedIn', beeld.linkedinUrl],
          ]}
        />

        <VeldBlok
          titel="Gegevens"
          rijen={[
            ['Aanhef', beeld.aanhef],
            ['Voorletter', beeld.voorletter],
            ['Geslacht', beeld.geslacht ? (GESLACHT_LABEL[beeld.geslacht] ?? beeld.geslacht) : null],
            ['Geboortedatum', beeld.geboortedatum],
          ]}
        />

        {/* Verschijnt vanzelf zodra iemand een privéveld invult; vandaag staat er niets in. */}
        <VeldBlok
          titel="Privé"
          rijen={[
            ['Privé-e-mail', beeld.priveEmail],
            ['Privé-telefoon', beeld.priveTelefoon],
            ['Privéadres', beeld.priveAdres],
          ]}
        />

        {beeld.opmerkingen && (
          <div style={{
            background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14,
            padding: 14, marginBottom: 14,
          }}>
            <div style={{
              fontSize: 11.5, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
              letterSpacing: '.04em', marginBottom: 6,
            }}>
              Opmerkingen
            </div>
            <div style={{
              fontSize: 13.5, lineHeight: 1.5, color: TEKST, whiteSpace: 'pre-wrap',
            }}>
              {beeld.opmerkingen}
            </div>
          </div>
        )}

        <KlapBlok
          titel="Dossiers op zijn naam"
          aantal={beeld.dossiers.length}
          standaardOpen={beeld.dossiers.length > 0 && beeld.dossiers.length <= 5}
          leegTekst="Er staat geen dossier op deze contactpersoon."
        >
          {beeld.dossiers.map(d => (
            <DossierRegel key={d.id} dossier={d} toonJaar terugNaar={terugNaar} />
          ))}
        </KlapBlok>

        <KlapBlok
          titel="Gesprekken met hem"
          aantal={beeld.notities.length}
          standaardOpen={beeld.notities.length > 0}
          leegTekst="Nog geen gesprek met deze persoon vastgelegd. Dat doe je met de knop onderaan."
        >
          <NotitieLijst
            notities={beeld.notities}
            currentMedewerkerId={currentMedewerkerId}
            magVerwijderen={magSchrijven}
          />
        </KlapBlok>
      </div>

      {/* Dezelfde knop als op het klantbeeld, maar met deze persoon al ingevuld: je legt vast
          wat je met hém besprak. Werkt hij bij meerdere organisaties, dan vraagt de sheet bij
          welke het hoort — de primaire staat voor. */}
      <VastleggenSheet
        relaties={beeld.organisaties.map(o => ({ id: o.relatieId, naam: o.naam }))}
        titelVoorvoegsel={beeld.naam}
        contactpersonen={[]}
        vasteContactpersoonId={beeld.id}
        medewerkers={medewerkers}
        currentMedewerkerId={currentMedewerkerId}
        magNotitie={magSchrijven}
        magVerkoopkans={magVerkoopkans}
      />
    </>
  )
}
