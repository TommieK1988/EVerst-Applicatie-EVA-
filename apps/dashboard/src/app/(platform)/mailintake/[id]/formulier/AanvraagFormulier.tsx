'use client'

/**
 * Het intakeformulier gevuld met de schermtoestand.
 *
 * Losgetrokken van `BerichtBehandelen` omdat dat bestand anders over de 800 regels
 * gaat en de schuldteller de push blokkeert. Hier staat alleen het koppelen van
 * waarden aan velden; de vaste sectievolgorde zit in `IntakeFormulier`, de regels
 * over kleur in `lib/mailintake/veld-eisen.ts`.
 */

import React from 'react'

import { Button } from '@/components/ui'
import { FormSection } from '@/components/ui/form-field'
import IntakeFormulier, { VELD_VAN_INVOER, type FormulierWaarden } from './IntakeFormulier'
import RollenSectie, { type Rolbezetting, type RolSleutel } from './RollenSectie'
import TermijnenSectie from './TermijnenSectie'
import WerkadresBlok from '../panelen/WerkadresBlok'
import WerkzaamhedenBlok from '../panelen/WerkzaamhedenBlok'
import { klein, veldStijl, Veld } from '../panelen/velden'
import type { VeldSleutel } from '@/lib/mailintake/veld-eisen'
import type { Oordelen } from '@/lib/mailintake/veld-status'
import type { OpdrachtgeverZoekResultaat } from '@/lib/dossiers/actions'
import type { useWerkadres } from '../panelen/gebruik-werkadres'


/**
 * De ruwe modeluitvoer is `unknown`; deze twee zetten hem om naar wat een veld
 * verwacht. Bewust met een controle en niet met een blinde cast: die verbergt
 * precies de fout die je wilt zien als het schema verandert.
 */
const tekst = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null
const getal = (v: unknown): number | null => (typeof v === 'number' ? v : null)
const lijst = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : null

export interface AanvraagFormulierProps {
  oordelen: Oordelen
  bewerkbaar: boolean
  categorieen: { id: number; name: string }[]
  werkmaatschappijen: { id: string; naam: string }[]
  medewerkers: { id: string; naam: string }[]
  waarden: FormulierWaarden
  zetWaarde: <K extends keyof FormulierWaarden>(veld: K, waarde: FormulierWaarden[K]) => void
  raakAan: (veld: VeldSleutel) => void

  bericht: Record<string, unknown> & { id: string }
  velden: Record<string, unknown>
  gekeurd: Record<string, unknown> | null
  zekerheid: Record<string, number>
  bijlagen: { bestandsnaam: string; rol?: string | null }[]
  factuuradresVoorstel:
    | { naam: string | null; straat: string | null; postcode: string | null; plaats: string | null }
    | null
  factuuradresOvernemen: boolean
  zetFactuuradresOvernemen: (v: boolean) => void

  // De opdrachtgeverkeuze houdt zijn toestand boven dit formulier: de zoekactie en
  // de contactpersonenlijst hangen aan het scherm als geheel.
  klantId: string | null
  klantNaam: string
  zetKlant: (id: string | null, naam?: string) => void
  klantZoek: string
  zetKlantZoek: (v: string) => void
  klantOpties: OpdrachtgeverZoekResultaat[]
  wisOpties: () => void
  contactpersonen: { id: string; naam: string }[]
  contactpersoonId: string | null
  zetContactpersoon: (id: string | null) => void

  /** Het werkadres met de adresservice erachter; zie `gebruik-werkadres.ts`. */
  adres: ReturnType<typeof useWerkadres>
  projectOmschrijving: { scope: string; buitenScope: string; aandachtspunten: string }
  zetProjectOmschrijving: (v: { scope: string; buitenScope: string; aandachtspunten: string }) => void
  rollen: Rolbezetting
  zetRol: (rol: RolSleutel, medewerkerId: string) => void
  /**
   * Wat er in de sectie "Het dossier" komt. Bij een opdracht op een offerte is dat
   * de offertekeuze; bij een aanvraag een regel die zegt dat er een nieuw dossier
   * komt. Dezelfde plek, andere inhoud -- dát was het hele punt.
   */
  dossierSectie?: React.ReactNode
  /** Het gekozen offertedossier; de termijnen worden daarover berekend. */
  offerteDossierId?: string | null
  /** Speelt het termijnenblok bij deze afhandeling? */
  termijnenActief?: boolean
  /** De factuurkeuze staat bij de offerte; hier alleen verwijzen. */
  verwijsFactuurkeuze?: boolean
}

export default function AanvraagFormulier(p: AanvraagFormulierProps) {
  const {
    oordelen, bewerkbaar, categorieen, werkmaatschappijen, medewerkers,
    waarden, zetWaarde, raakAan, bericht: b, velden, gekeurd, zekerheid, bijlagen,
    factuuradresVoorstel, factuuradresOvernemen, zetFactuuradresOvernemen,
    klantId, klantNaam, zetKlant, klantZoek, zetKlantZoek, klantOpties, wisOpties,
    contactpersonen, contactpersoonId, zetContactpersoon,
    adres, projectOmschrijving, zetProjectOmschrijving, rollen, zetRol, dossierSectie,
    offerteDossierId = null, termijnenActief = false, verwijsFactuurkeuze = false,
  } = p

  return (
          <IntakeFormulier
            oordelen={oordelen}
            bewerkbaar={bewerkbaar}
            categorieen={categorieen}
            werkmaatschappijen={werkmaatschappijen}
            waarden={waarden}
            opWijzig={(veld, waarde) => {
              // Elke wijziging telt als nagekeken: het veld wordt groen in plaats van
              // oranje te blijven staan alsof EVA er nog over twijfelt.
              const sleutel = VELD_VAN_INVOER[veld]
              if (sleutel) raakAan(sleutel)
              zetWaarde(veld, waarde)
            }}
            gelezen={{
              contactpersoonEmail: tekst(velden.contactpersoon_email),
              contactpersoonTelefoon: tekst(velden.contactpersoon_telefoon),
              onzeOfferteReferentie: tekst(velden.onze_offerte_referentie),
              aanvraagdatum: tekst(velden.aanvraagdatum),
              gewensteStart: tekst(velden.gewenste_start),
              bedragExclBtw: getal(velden.bedrag_excl_btw),
              aardVanHetWerk: tekst(velden.aard_van_het_werk),
              regieAanwijzing: tekst(velden.regie_aanwijzing),
              betrokkenen: (gekeurd?.betrokkenen ?? []) as { naam: string; rol?: string | null }[],
              bijlagen,
              factuuradres: factuuradresVoorstel,
            }}
            opdrachtgever={
              <>
                <Veld label="Opdrachtgever" score={zekerheid.klant_naam} toon={oordelen.klant_naam?.status}>
                  {klantId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{klantNaam}</span>
                      {bewerkbaar && (
                        <Button variant="ghost" onClick={() => { zetKlant(null); zetContactpersoon(null) }}>
                          wijzigen
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        style={veldStijl}
                        placeholder="Zoek op naam, adres of e-mailadres..."
                        value={klantZoek}
                        onChange={e => zetKlantZoek(e.target.value)}
                        disabled={!bewerkbaar}
                      />
                      {klantOpties.length > 0 && (
                        <div style={{ marginTop: 4, border: '1px solid var(--border)', borderRadius: 6, maxHeight: 180, overflowY: 'auto' }}>
                          {klantOpties.map(o => (
                            <button
                              key={o.id}
                              onClick={() => {
                                zetKlant(o.id, o.naam)
                                if (o.contactpersoon) zetContactpersoon(o.contactpersoon.id)
                                zetKlantZoek(''); wisOpties()
                              }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left', padding: '6px 9px',
                                fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                              }}
                            >
                              {o.naam}
                              {o.contactpersoon && <span style={klein}> &middot; {o.contactpersoon.naam}</span>}
                              {o.viaFactuuradres && <span style={klein}> &middot; factuuradres: {o.viaFactuuradres}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Veld>

                {/* Altijd zichtbaar, ook zonder gekozen opdrachtgever. Dit veld
                    verscheen pas als de contactpersonenlijst geladen was, en dat
                    liet het hele formulier eronder opschuiven. */}
                <Veld label="Contactpersoon" score={zekerheid.contactpersoon_naam} toon={oordelen.contactpersoon_naam?.status}>
                  <select
                    style={veldStijl}
                    value={contactpersoonId ?? ''}
                    onChange={e => { zetContactpersoon(e.target.value || null); raakAan('contactpersoon_naam') }}
                    disabled={!bewerkbaar || !klantId || contactpersonen.length === 0}
                  >
                    <option value="">
                      {!klantId ? '\u2014 kies eerst een opdrachtgever \u2014' : '\u2014 geen \u2014'}
                    </option>
                    {contactpersonen.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
                  </select>
                </Veld>
              </>
            }
            werkadres={<WerkadresBlok adres={adres} zekerheid={zekerheid} bewerkbaar={bewerkbaar} />}
            werkzaamheden={
              <WerkzaamhedenBlok
                berichtId={b.id}
                opgeslagen={{
                  scope: tekst(b.gevraagde_werkzaamheden) ?? '',
                  buitenScope: tekst(b.buiten_scope) ?? '',
                  aandachtspunten: tekst(b.aandachtspunten) ?? '',
                }}
                bronnen={lijst(b.gevraagde_werkzaamheden_bronnen)}
                gemist={lijst(b.gevraagde_werkzaamheden_gemist)}
                waarden={projectOmschrijving}
                opWijzig={zetProjectOmschrijving}
                bewerkbaar={bewerkbaar}
              />
            }
            dossier={dossierSectie ?? (
              <FormSection title="Het dossier" description="Waar dit terechtkomt">
                <span style={klein}>
                  EVA maakt hiervan een nieuw dossier. Hoort het t&oacute;ch bij een offerte van
                  ons, dan wijs je die hieronder aan.
                </span>
              </FormSection>
            )}
            rollen={
              <RollenSectie
                waarden={rollen}
                opWijzig={(rol, id) => zetRol(rol, id)}
                medewerkers={medewerkers}
                bewerkbaar={bewerkbaar}
              />
            }
            termijnen={<TermijnenSectie dossierId={offerteDossierId} actief={termijnenActief} />}
            factuurkeuze={
              verwijsFactuurkeuze ? (
                <span style={klein}>
                  Waar de factuur heen gaat, kies je hierboven bij de offerte.
                </span>
              ) : factuuradresVoorstel ? (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                  <input
                    type="checkbox" checked={factuuradresOvernemen} disabled={!bewerkbaar}
                    onChange={e => zetFactuuradresOvernemen(e.target.checked)} style={{ marginTop: 3 }}
                  />
                  <span>Dit factuuradres vastleggen bij deze opdrachtgever</span>
                </label>
              ) : (
                <span style={klein}>De opdracht noemt geen apart factuuradres.</span>
              )
            }
          />
  )
}
