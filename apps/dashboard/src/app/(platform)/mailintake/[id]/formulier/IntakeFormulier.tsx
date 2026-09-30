'use client'

/**
 * Het intakeformulier: elf secties, altijd alle elf, altijd in deze volgorde.
 *
 * WAAROM ALLES ALTIJD ZICHTBAAR IS
 * Hiervoor stonden er twee verschillende formulieren in deze kolom -- een opdracht
 * op een offerte kreeg een compleet ander scherm dan een aanvraag, en binnen het
 * aanvraagformulier verschenen en verdwenen nog eens vier blokken. Wie twee mails
 * achter elkaar behandelde, moest elke keer opnieuw zoeken waar iets stond.
 *
 * Wat per bericht verschilt is nu alleen de kléúr van een veld, niet zijn plek:
 * groen als het is ingevuld en er niets na te kijken valt, oranje bij twijfel, rood
 * als het leeg is terwijl het nodig is, gedimd als het bij deze afhandeling geen rol
 * speelt. De regels daarvoor staan in `lib/mailintake/veld-eisen.ts`.
 *
 * Een gedimd veld blijft leesbaar en bewerkbaar. "Speelt hier geen rol" betekent
 * niet "mag je niet invullen": bij een opdracht op een offerte staat het werkadres
 * al op het dossier, maar corrigeren moet kunnen.
 */

import React from 'react'

import { Card } from '@/components/ui'
import { FormSection } from '@/components/ui/form-field'
import { klein } from '../panelen/velden'
import { StatusVeld, Tekst, Meerregelig, Keuze, Leeswaarde } from './StatusVeld'
import type { Oordelen } from '@/lib/mailintake/veld-status'
import type { VeldSleutel } from '@/lib/mailintake/veld-eisen'

/** Twee of drie velden naast elkaar, op het 4px-raster. */
function Rij({ kolommen = 2, children }: { kolommen?: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: kolommen === 3 ? '1fr 1fr 1fr' : '1fr 1fr',
        gap: 8,
      }}
    >
      {children}
    </div>
  )
}

export interface FormulierWaarden {
  omschrijving: string
  categorieId: number | ''
  werkmaatschappijId: string
  referentie: string
  opdrachtReferentie: string
  vveCode: string
  opdrachtdatum: string
  deadline: string
  mandaat: string
  regie: boolean
  opmerkingen: string
  klantOpmerkingen: string
}

/**
 * Welk veld uit het statusmodel bij welke invoer hoort.
 *
 * Nodig omdat de invoernamen op het scherm (`categorieId`, `mandaat`) niet dezelfde
 * zijn als de sleutels van het AI-schema (`categorie_voorstel`, `mandaat_bedrag`).
 * Zonder deze vertaling zou een veld dat je zojuist hebt aangepast oranje blijven.
 */
export const VELD_VAN_INVOER: Record<keyof FormulierWaarden, VeldSleutel> = {
  omschrijving: 'omschrijving',
  categorieId: 'categorie_voorstel',
  werkmaatschappijId: 'werkmaatschappij_voorstel',
  referentie: 'referentie',
  opdrachtReferentie: 'opdracht_referentie',
  vveCode: 'vve_code',
  opdrachtdatum: 'opdrachtdatum',
  deadline: 'deadline',
  mandaat: 'mandaat_bedrag',
  regie: 'regie',
  opmerkingen: 'opmerkingen',
  klantOpmerkingen: 'klant_opmerkingen',
}

export interface IntakeFormulierProps {
  oordelen: Oordelen
  bewerkbaar: boolean
  waarden: FormulierWaarden
  opWijzig: <K extends keyof FormulierWaarden>(veld: K, waarde: FormulierWaarden[K]) => void
  categorieen: { id: number; name: string }[]
  werkmaatschappijen: { id: string; naam: string }[]

  /** Gegevens die alleen gelezen worden; ze komen uit de mail of het dossier. */
  gelezen: {
    contactpersoonEmail: string | null
    contactpersoonTelefoon: string | null
    onzeOfferteReferentie: string | null
    aanvraagdatum: string | null
    gewensteStart: string | null
    bedragExclBtw: number | null
    aardVanHetWerk: string | null
    regieAanwijzing: string | null
    betrokkenen: { naam: string; rol?: string | null }[]
    bijlagen: { bestandsnaam: string; rol?: string | null }[]
    factuuradres: { naam: string | null; straat: string | null; postcode: string | null; plaats: string | null } | null
  }

  /** Delen met eigen toestand, die het formulier alleen een vaste plek geeft. */
  opdrachtgever: React.ReactNode
  werkadres: React.ReactNode
  werkzaamheden: React.ReactNode
  dossier: React.ReactNode
  rollen: React.ReactNode
  termijnen: React.ReactNode
  factuurkeuze?: React.ReactNode
}

export default function IntakeFormulier(p: IntakeFormulierProps) {
  const { oordelen: o, bewerkbaar, waarden: v, opWijzig, gelezen } = p

  return (
    <Card style={{ padding: 16 }}>
      {/* ── 1. Opdrachtgever ── */}
      <FormSection title="Opdrachtgever">
        {p.opdrachtgever}
        <Rij>
          <StatusVeld sleutel="contactpersoon_email" label="E-mail" oordelen={o}>
            <Leeswaarde waarde={gelezen.contactpersoonEmail} />
          </StatusVeld>
          <StatusVeld sleutel="contactpersoon_telefoon" label="Telefoon" oordelen={o}>
            <Leeswaarde waarde={gelezen.contactpersoonTelefoon} />
          </StatusVeld>
        </Rij>
        <StatusVeld
          sleutel="betrokkenen"
          label="Betrokkenen"
          oordelen={o}
          uitleg="Mensen die in de mail genoemd worden; eigen collega's blijven weg."
        >
          <Leeswaarde
            waarde={gelezen.betrokkenen.length
              ? gelezen.betrokkenen
                  .map(b => (b.rol ? `${b.naam} (${b.rol})` : b.naam))
                  .join(' · ')
              : null}
          />
        </StatusVeld>
      </FormSection>

      {/* ── 2. Werkadres ── */}
      {p.werkadres}

      {/* ── 3. Het werk ── */}
      <FormSection title="Het werk">
        {p.werkzaamheden}

        <StatusVeld sleutel="omschrijving" label="Omschrijving van het werk" oordelen={o}>
          <Tekst
            waarde={v.omschrijving}
            opWijzig={x => opWijzig('omschrijving', x)}
            bewerkbaar={bewerkbaar}
          />
        </StatusVeld>

        <Rij>
          <StatusVeld sleutel="werkmaatschappij_voorstel" label="Werkmaatschappij" oordelen={o}>
            <Keuze
              waarde={v.werkmaatschappijId}
              opWijzig={x => opWijzig('werkmaatschappijId', x)}
              bewerkbaar={bewerkbaar}
              opties={p.werkmaatschappijen.map(w => ({ waarde: w.id, label: w.naam }))}
            />
          </StatusVeld>
          <StatusVeld sleutel="categorie_voorstel" label="Categorie" oordelen={o}>
            <Keuze
              waarde={v.categorieId === '' ? '' : String(v.categorieId)}
              opWijzig={x => opWijzig('categorieId', x ? Number(x) : '')}
              bewerkbaar={bewerkbaar}
              opties={p.categorieen.map(c => ({ waarde: String(c.id), label: c.name }))}
            />
          </StatusVeld>
        </Rij>

        <StatusVeld
          sleutel="aard_van_het_werk"
          label="Aard van het werk"
          oordelen={o}
          uitleg="Bepaalt mee welke werkmaatschappij het wordt."
        >
          <Leeswaarde waarde={gelezen.aardVanHetWerk} />
        </StatusVeld>
      </FormSection>

      {/* ── 4. Het dossier ──
          De kern van de vaste opmaak: hier stond vroeger óf niets, óf een compleet
          ander formulier. Nu is het één sectie op een vaste plek. */}
      {p.dossier}

      {/* ── 5. Rollen ── */}
      {p.rollen}

      {/* ── 6. Nummers ── */}
      <FormSection title="Nummers">
        <Rij>
          <StatusVeld sleutel="referentie" label="Referentie klant" oordelen={o}>
            <Tekst
              waarde={v.referentie}
              opWijzig={x => opWijzig('referentie', x)}
              bewerkbaar={bewerkbaar}
            />
          </StatusVeld>
          <StatusVeld sleutel="vve_code" label="VvE-code" oordelen={o}>
            <Tekst
              waarde={v.vveCode}
              opWijzig={x => opWijzig('vveCode', x)}
              bewerkbaar={bewerkbaar}
            />
          </StatusVeld>
        </Rij>
        <Rij>
          <StatusVeld
            sleutel="opdracht_referentie"
            label="Opdrachtreferentie"
            oordelen={o}
            uitleg="Moet op de factuur terugkomen."
          >
            <Tekst
              waarde={v.opdrachtReferentie}
              opWijzig={x => opWijzig('opdrachtReferentie', x)}
              bewerkbaar={bewerkbaar}
            />
          </StatusVeld>
          <StatusVeld sleutel="onze_offerte_referentie" label="Ons offertenummer" oordelen={o}>
            <Leeswaarde waarde={gelezen.onzeOfferteReferentie} />
          </StatusVeld>
        </Rij>
      </FormSection>

      {/* ── 7. Datums ── */}
      <FormSection title="Datums">
        <Rij kolommen={3}>
          <StatusVeld sleutel="aanvraagdatum" label="Aanvraagdatum" oordelen={o}>
            <Leeswaarde waarde={gelezen.aanvraagdatum} />
          </StatusVeld>
          <StatusVeld sleutel="opdrachtdatum" label="Opdrachtdatum" oordelen={o}>
            <Tekst
              type="date"
              waarde={v.opdrachtdatum}
              opWijzig={x => opWijzig('opdrachtdatum', x)}
              bewerkbaar={bewerkbaar}
            />
          </StatusVeld>
          <StatusVeld sleutel="deadline" label="Deadline" oordelen={o}>
            <Tekst
              type="date"
              waarde={v.deadline}
              opWijzig={x => opWijzig('deadline', x)}
              bewerkbaar={bewerkbaar}
            />
          </StatusVeld>
        </Rij>
        <StatusVeld sleutel="gewenste_start" label="Gewenste start" oordelen={o}>
          <Leeswaarde waarde={gelezen.gewensteStart} />
        </StatusVeld>
      </FormSection>

      {/* ── 8. Geld ── */}
      <FormSection title="Geld">
        <Rij>
          <StatusVeld sleutel="bedrag_excl_btw" label="Bedrag excl. btw" oordelen={o}>
            <Leeswaarde
              waarde={gelezen.bedragExclBtw != null
                ? gelezen.bedragExclBtw.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
                : null}
            />
          </StatusVeld>
          <StatusVeld
            sleutel="mandaat_bedrag"
            label="Mandaat (excl. btw)"
            oordelen={o}
            uitleg="Alleen als de bon een mandaat of budgetplafond noemt; een los bedrag is meestal de geschatte prijs."
          >
            <Tekst
              waarde={v.mandaat}
              opWijzig={x => opWijzig('mandaat', x)}
              bewerkbaar={bewerkbaar}
              plaatshouder="Bedrag waarbinnen we mogen werken"
            />
          </StatusVeld>
        </Rij>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={v.regie}
            disabled={!bewerkbaar}
            onChange={e => opWijzig('regie', e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Regie — afrekenen op nacalculatie, geen aanneemsom
            <span style={{ ...klein, display: 'block' }}>
              {gelezen.regieAanwijzing
                ? `Uit de opdracht: “${gelezen.regieAanwijzing}”`
                : 'EVA vond hier geen aanwijzing voor; zet het zelf aan als het toch regiewerk is.'}
            </span>
          </span>
        </label>
      </FormSection>

      {/* ── 9. Termijnen ── */}
      {p.termijnen}

      {/* ── 10. Facturering ── */}
      <FormSection title="Facturering">
        <StatusVeld
          sleutel="factuuradres_naam"
          label="Factuur op naam van"
          oordelen={o}
          uitleg="De opdrachtgever blijft dezelfde; dit gaat alleen over waar de factuur heen gaat."
        >
          <Leeswaarde waarde={gelezen.factuuradres?.naam ?? null} />
        </StatusVeld>
        <Rij kolommen={3}>
          <StatusVeld sleutel="factuuradres_straat" label="Straat of postbus" oordelen={o}>
            <Leeswaarde waarde={gelezen.factuuradres?.straat ?? null} />
          </StatusVeld>
          <StatusVeld sleutel="factuuradres_postcode" label="Postcode" oordelen={o}>
            <Leeswaarde waarde={gelezen.factuuradres?.postcode ?? null} />
          </StatusVeld>
          <StatusVeld sleutel="factuuradres_plaats" label="Plaats" oordelen={o}>
            <Leeswaarde waarde={gelezen.factuuradres?.plaats ?? null} />
          </StatusVeld>
        </Rij>
        {p.factuurkeuze}
      </FormSection>

      {/* ── 11. Bijzonderheden ── */}
      <FormSection title="Bijzonderheden">
        <StatusVeld
          sleutel="opmerkingen"
          label="Opmerkingen"
          oordelen={o}
          uitleg="Voor de behandelaar: bereikbaarheid, sleutels, asbest, bewoners."
        >
          <Meerregelig
            waarde={v.opmerkingen}
            opWijzig={x => opWijzig('opmerkingen', x)}
            bewerkbaar={bewerkbaar}
          />
        </StatusVeld>
        <StatusVeld
          sleutel="klant_opmerkingen"
          label="Opmerking van de klant"
          oordelen={o}
          uitleg="Komt als notitie op het dossier."
        >
          <Meerregelig
            waarde={v.klantOpmerkingen}
            opWijzig={x => opWijzig('klantOpmerkingen', x)}
            bewerkbaar={bewerkbaar}
          />
        </StatusVeld>
        <div style={klein}>
          {gelezen.bijlagen.length === 0
            ? 'Geen bijlagen.'
            : `${gelezen.bijlagen.length} bijlage${gelezen.bijlagen.length === 1 ? '' : 'n'} — `
              + gelezen.bijlagen.map(b => b.rol ?? 'overig').join(', ')}
        </div>
      </FormSection>
    </Card>
  )
}
