'use client'

/**
 * Het behandelscherm. Drie kolommen: links de mail zoals hij binnenkwam, in het
 * midden het voorstel van EVA, rechts waaróp dat voorstel berust.
 *
 * De mailtekst wordt als platte tekst gerenderd, nooit als HTML. Dat is bewust:
 * er zitten tracking-pixels en remote content in klantmail, en de tekst is al
 * gestript bij het ophalen.
 */

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { Button, Card, useDialogen } from '@/components/ui'
import { zoekRelaties, type OpdrachtgeverZoekResultaat } from '@/lib/dossiers/actions'
import { getContactpersonenVoorOrganisatie } from '@/lib/relaties/contactpersonen-actions'
// Er is geen route /dossiers/<id>: een dossier woont onder zijn sectie.
import { dossierHref, dossierSegment } from '@/lib/dossiers/href'
import {
  maakDossierVanBericht, proefDossierVanBericht, koppelBerichtAanDossier, getBijlageUrl,
} from '@/lib/mailintake/actions'
import {
  DUPLICAAT_TWIJFEL, MAIL_SOORT_LABELS, bepaalRoute,
  type MailSoort,
} from '@/lib/mailintake/types'
import { VELD_LABELS } from '@/lib/mailintake/schema'
import OpdrachtPaneel from './panelen/OpdrachtPaneel'
import { FASE_PLAATSINGEN } from '@/components/dossiers/fase-plaatsing'
import MailPaneel from './panelen/MailPaneel'
import AfgehandeldBalk from './panelen/AfgehandeldBalk'
import AndereWeg from './panelen/AndereWeg'
import BeoordelingPaneel from './panelen/BeoordelingPaneel'
import WerkzaamhedenBlok from './panelen/WerkzaamhedenBlok'
import TwijfelPaneel, { bouwTwijfelVelden } from './panelen/TwijfelPaneel'
import { Voorvertoning, Afwijkingen } from './panelen/voorvertoning'
import { bouwVeldenVoorAanmaak } from './panelen/aanmaak-velden'
import { useFase } from './panelen/fase-keuze'
import { useKoppelen } from './formulier/gebruik-koppelen'
import { useWerkmaatschappij } from './panelen/gebruik-werkmaatschappij'
import { useWerkadres } from './panelen/gebruik-werkadres'
import WerkadresBlok from './panelen/WerkadresBlok'
import { useWeglegActies } from './panelen/wegleg-acties'
import { klein, kop, veldStijl, Veld } from './panelen/velden'
import { FormSection } from '@/components/ui/form-field'
import AanvraagFormulier from './formulier/AanvraagFormulier'
import { VELD_VAN_INVOER, type FormulierWaarden } from './formulier/IntakeFormulier'
import RollenSectie, { type Rolbezetting, type RolSleutel } from './formulier/RollenSectie'
import TermijnenSectie from './formulier/TermijnenSectie'
import MeerwerkSectie from './formulier/MeerwerkSectie'
import type { VeldSleutel } from '@/lib/mailintake/veld-eisen'
import { useOordelen } from './formulier/gebruik-oordelen'
import { useDossierOvername } from './formulier/gebruik-dossier-overname'
import { magAfhandelen, ontbrekendeVelden } from '@/lib/mailintake/veld-status'

type Detail = {
  bericht: any
  postbus: any
  bijlagen: any[]
  groepsMails: any[]
  extractie: any
  duplicaten: any[]
  log: any[]
}

type ObjectTreffer = {
  objectId: string | null
  naam: string | null
  score: number
  via: string | null
  kandidaten: { id: string; naam: string; adres: string; score: number; via: string }[]
  toelichting: string
} | null

export default function BerichtBehandelen({
  detail, objectTreffer, werkmaatschappijen, categorieen, medewerkers, magSchrijven,
}: {
  detail: Detail
  objectTreffer: ObjectTreffer
  werkmaatschappijen: { id: string; naam: string }[]
  categorieen: { id: number; name: string }[]
  /** Actieve medewerkers, voor het calculatorveld. */
  medewerkers: { id: string; naam: string }[]
  magSchrijven: boolean
}) {
  const router = useRouter()
  const { bevestig, meld } = useDialogen()
  const b = detail.bericht
  const velden = (detail.extractie?.velden ?? {}) as Record<string, any>
  // Wat EVA er na de keuring van maakte. `velden` is de ruwe uitvoer van het model;
  // voor alles wat de route bepaalt telt het gekeurde resultaat, anders toont het
  // scherm een andere route dan de server heeft gelopen.
  const gekeurd = (detail.extractie?.gekeurde_velden ?? null) as Record<string, any> | null
  const zekerheid = (detail.extractie?.vertrouwen ?? {}) as Record<string, number>

  const afgehandeld = ['verwerkt', 'genegeerd'].includes(b.status)
  const bewerkbaar = magSchrijven && !afgehandeld

  // ── Formulier ──────────────────────────────────────────────────────────────
  const [klantId, setKlantId] = useState<string | null>(b.relatie?.id ?? null)
  const [klantNaam, setKlantNaam] = useState<string>(b.relatie?.naam ?? velden.klant_naam ?? '')
  const [klantZoek, setKlantZoek] = useState('')
  const [klantOpties, setKlantOpties] = useState<OpdrachtgeverZoekResultaat[]>([])
  const [contactpersonen, setContactpersonen] = useState<{ id: string; naam: string }[]>([])
  const [contactpersoonId, setContactpersoonId] = useState<string | null>(b.contactpersoon?.id ?? null)

  const [omschrijving, setOmschrijving] = useState(velden.omschrijving ?? '')
  const [categorieId, setCategorieId] = useState<number | ''>('')
  const [referentie, setReferentie] = useState(velden.referentie ?? '')
  const [vveCode, setVveCode] = useState(velden.vve_code ?? '')
  const [deadline, setDeadline] = useState(velden.deadline ?? '')
  const [opmerkingen, setOpmerkingen] = useState(velden.opmerkingen ?? '')

  // Het werkadres met de adresservice erachter; zie `gebruik-werkadres.ts`.
  const adres = useWerkadres({
    straat: velden.werkadres_straat ?? null,
    huisnummer: velden.werkadres_huisnummer ?? null,
    postcode: velden.werkadres_postcode ?? null,
    stad: velden.werkadres_stad ?? null,
    contact: {
      naam: velden.werkadres_contact_naam ?? null,
      telefoon: velden.werkadres_contact_telefoon ?? null,
      email: velden.werkadres_contact_email ?? null,
    },
    bewerkbaar,
  })
  const {
    straat, setStraat, huisnummer, setHuisnummer, postcode, stad,
    bevestigd: adresBevestigd, controleer: controleerAdres,
  } = adres

  const [regie, setRegie] = useState<boolean>(Boolean(velden.regie))
  const [factuuradresOvernemen, setFactuuradresOvernemen] = useState(true)

  const [mandaat, setMandaat] = useState<string>(
    velden.mandaat_bedrag != null ? String(velden.mandaat_bedrag) : '',
  )

  // Velden die eerder wél werden weggeschreven maar nergens op het scherm stonden.
  // Je kon ze dus niet nakijken of corrigeren, terwijl ze op het dossier belandden.
  const [opdrachtReferentie, setOpdrachtReferentie] = useState<string>(
    velden.opdracht_referentie ?? '',
  )
  const [opdrachtdatum, setOpdrachtdatum] = useState<string>(
    velden.opdrachtdatum ?? ((b.ontvangen_op ?? '').slice(0, 10) || ''),
  )
  const [klantOpmerkingen, setKlantOpmerkingen] = useState<string>(velden.klant_opmerkingen ?? '')

  // De projectrollen, meteen invulbaar. Alleen de calculator kon hier eerder worden
  // aangewezen; de rest moest achteraf op het dossier.
  const [rollen, setRollen] = useState<Rolbezetting>({})

  /**
   * Welke velden de behandelaar zelf heeft aangeraakt.
   *
   * Wie een veld nakijkt of corrigeert, wil niet dat het oranje blijft staan alsof
   * EVA er nog over twijfelt. Een aangeraakt veld telt daarom als vastgesteld.
   */
  const [aangeraakt, setAangeraakt] = useState<ReadonlySet<VeldSleutel>>(new Set())
  const raakAan = React.useCallback((veld: VeldSleutel) => {
    setAangeraakt(prev => (prev.has(veld) ? prev : new Set(prev).add(veld)))
  }, [])

  /** Eén ingang voor alle losse velden, zodat het formulier er niet twaalf nodig heeft. */
  function zetWaarde<K extends keyof FormulierWaarden>(veld: K, waarde: FormulierWaarden[K]) {
    switch (veld) {
      case 'omschrijving': setOmschrijving(waarde as string); break
      case 'categorieId': setCategorieId(waarde as number | ''); break
      case 'werkmaatschappijId': setWerkmaatschappijId(waarde as string); break
      case 'referentie': setReferentie(waarde as string); break
      case 'opdrachtReferentie': setOpdrachtReferentie(waarde as string); break
      case 'vveCode': setVveCode(waarde as string); break
      case 'opdrachtdatum': setOpdrachtdatum(waarde as string); break
      case 'deadline': setDeadline(waarde as string); break
      case 'mandaat': setMandaat(waarde as string); break
      case 'regie': setRegie(waarde as boolean); break
      case 'opmerkingen': setOpmerkingen(waarde as string); break
      case 'klantOpmerkingen': setKlantOpmerkingen(waarde as string); break
    }
  }

  // De projectomschrijving in de drie delen waarin hij ook in Bouw7 terechtkomt.
  const [projectOmschrijving, setProjectOmschrijving] = useState({
    scope: b.gevraagde_werkzaamheden ?? '',
    buitenScope: b.buiten_scope ?? '',
    aandachtspunten: b.aandachtspunten ?? '',
  })

  // Voorkeur: wat er al aan het bericht hangt; anders de verse treffer.
  const [objectId, setObjectId] = useState<string | null>(
    b.object?.id ?? objectTreffer?.objectId ?? null,
  )

  // De calculator kan hier al worden aangewezen. Bewust leeg beginnen en nooit
  // afleiden uit wie de intake doet: dat is een andere rol, en een verkeerde
  // calculator op een dossier leidt de hele planning om.
  const [calculatorId, setCalculatorId] = useState<string>('')

  // De eerste actie op het nieuwe dossier. Leeg laten betekent: geen actie.
  const [actie, setActie] = useState({ titel: '', medewerkerId: '', dagen: 3 })

  const [bezig, setBezig] = useState(false)

  // Negeren, "geen aanvraag", opnieuw lezen en heropenen zijn een eigen onderwerp
  // en staan in panelen/wegleg-acties.ts.
  const {
    bezig: weglegBezig, negeren, geenAanvraag, opnieuwLezen, heropen, openBijlage,
  } = useWeglegActies(b)

  // Eén vlag voor het hele scherm: ook tijdens een wegleg-actie horen de knoppen
  // uit te staan, anders kun je tijdens het negeren nog een dossier aanmaken.
  const inActie = bezig || weglegBezig

  // Categorie voorvullen op naam uit de extractie.
  React.useEffect(() => {
    if (categorieId !== '') return
    const naam = (velden.categorie_voorstel ?? '').toLowerCase()
    const hit = categorieen.find(c => c.name.toLowerCase() === naam)
      ?? (b.postbus?.standaard_bouw7_categorie_id
        ? categorieen.find(c => c.id === b.postbus.standaard_bouw7_categorie_id)
        : undefined)
    if (hit) setCategorieId(hit.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorieen])

  React.useEffect(() => {
    if (!klantId) { setContactpersonen([]); return }
    let actief = true
    getContactpersonenVoorOrganisatie(klantId)
      .then(rijen => {
        if (!actief) return
        setContactpersonen(rijen.map((r: any) => ({
          id: r.contactpersoon.id,
          naam: [r.contactpersoon.voornaam, r.contactpersoon.achternaam].filter(Boolean).join(' '),
        })))
      })
      .catch(() => {})
    return () => { actief = false }
  }, [klantId])

  React.useEffect(() => {
    const term = klantZoek.trim()
    if (term.length < 2) { setKlantOpties([]); return }
    let actief = true
    const t = setTimeout(() => {
      zoekRelaties(term).then(r => { if (actief) setKlantOpties(r) }).catch(() => {})
    }, 250)
    return () => { actief = false; clearTimeout(t) }
  }, [klantZoek])

  // Welke route hoort bij dit bericht? Een opdracht maakt geen nieuw dossier maar
  // wint een bestaande offerte; het scherm toont dan een ander paneel.
  const offerteKandidaten = detail.duplicaten.filter(d => d.soort === 'offerte_match')
  const isRegie = gekeurd ? Boolean(gekeurd.regie) : Boolean(velden.regie)
  const route = bepaalRoute(b.soort, offerteKandidaten.length > 0, isRegie)
  const isServicedesk = b.soort === 'servicedeskbon'

  const gekozenCategorieNaam = categorieen.find(c => c.id === categorieId)?.name ?? null

  // Waar het dossier heen gaat. De regel staat in `fase-keuze.ts`: de categorie
  // beslist over de servicedesk, niet de mailsoort en niet de behandelaar.
  const { fase, setFase, bezwaar: faseBezwaar } = useFase(gekozenCategorieNaam, b.soort)

  // De werkmaatschappij volgt uit de categorie en beweegt mee als je die corrigeert.
  // Zie `gebruik-werkmaatschappij.ts`; alleen Bouwkundig Onderhoud blijft twijfel.
  const { werkmaatschappijId, setWerkmaatschappijId, via: wmVia } = useWerkmaatschappij({
    categorieNaam: gekozenCategorieNaam,
    aard: (velden.aard_van_het_werk as string | null) ?? null,
    werkmaatschappijen,
    standaard: b.postbus?.standaard_werkmaatschappij_id ?? null,
  })

  // Bij regie maakt EVA een nieuw dossier: de prijs staat niet vast, dus er is geen
  // aanneemsom om te winnen. Soms is zo'n bon tóch het akkoord op een offerte --
  // dan hoort dat te kunnen, maar niet als standaard. Vandaar een uitklapblok,
  // alleen als er ook werkelijk een offerte bij past.
  // Een offerte die vanuit de duplicatenlijst wordt aangewezen: het opdrachtpaneel
  // springt er dan op open, want dáár wordt hij werkelijk gewonnen.
  // Geen offerte die past? Dan tóch een nieuw dossier. De route blijft wat hij is;
  // dit is de menselijke correctie erop, en met de link eronder draai je hem terug.
  const [forceerNieuw, setForceerNieuw] = useState(false)
  /**
   * Het dossier waarop dit meerwerk hoort.
   *
   * Voorgevuld met de sterkste kandidaat als die er duidelijk uitspringt. Is er niets
   * of zijn er meerdere even sterk, dan staat er niets aangevinkt -- het verkeerde
   * dossier aanwijzen zet een bewakingscode op de verkeerde opdracht.
   */
  const [gekozenMeerwerk, setGekozenMeerwerk] = useState<string | null>(() => {
    const mw = detail.duplicaten
      .filter((d: { soort: string }) => d.soort === 'meerwerk_kandidaat')
      .sort((a: { score: number }, z: { score: number }) => z.score - a.score)
    if (mw.length === 0) return null
    const tweede = mw[1]?.score ?? 0
    return mw[0].score >= 0.4 && mw[0].score - tweede >= 0.2 ? mw[0].dossierId : null
  })
  const [gekozenOfferte, setGekozenOfferte] = useState<string | null>(null)

  /**
   * De gegevens van het gekozen dossier; zie `gebruik-dossier-overname.ts`.
   *
   * Vult de velden die het dossier al weet. Het dossier blijft leidend: bevestigen
   * schrijft die waarden niet terug, en een afwijking met de mail kleurt oranje.
   */
  const gekozenDossier = gekozenMeerwerk ?? gekozenOfferte
  const uitDossier = useDossierOvername(gekozenDossier, {
    zetKlant: (id, naam) => { setKlantId(id); setKlantNaam(naam) },
    zetContactpersoon: setContactpersoonId,
    zetCategorie: setCategorieId,
    zetWerkmaatschappij: setWerkmaatschappijId,
    zetObject: setObjectId,
    zetAdres: v => {
      if (v.straat) adres.setStraat(v.straat)
      if (v.huisnummer) adres.setHuisnummer(v.huisnummer)
      if (v.postcode) adres.setPostcode(v.postcode)
      if (v.stad) adres.setStad(v.stad)
    },
    zetOmschrijving: setOmschrijving,
    zetVveCode: setVveCode,
    zetReferentie: setReferentie,
    zetDeadline: setDeadline,
    zetRollen: bij => setRollen(r => ({ ...bij, ...r })),
    huidig: { omschrijving, vveCode, referentie, deadline },
  })
  const [offerteOpen, setOfferteOpen] = useState(false)
  const kiesOfferte = (dossierId: string) => {
    setGekozenOfferte(dossierId)
    setOfferteOpen(true)
    setForceerNieuw(false)
  }

  const kanTochOfferte = (route === 'nieuw_dossier' || forceerNieuw)
    && klantId != null
    && (offerteKandidaten.length > 0 || b.soort === 'opdrachtbon' || b.soort === 'opdracht_op_offerte')

  // Het factuuradres uit de opdracht. Alleen aanbieden als er ook een adres bij staat;
  // een losse naam zegt niets over waar de factuur heen moet.
  const factuuradresVoorstel = (velden.factuuradres_straat || velden.factuuradres_postcode)
    ? {
        naam: velden.factuuradres_naam ?? null,
        straat: velden.factuuradres_straat ?? null,
        postcode: velden.factuuradres_postcode ?? null,
        plaats: velden.factuuradres_plaats ?? null,
      }
    : null

  // Wat het opdrachtpaneel van de herkenning moet weten. Die stond alleen in het
  // aanvraagformulier, waardoor het bij het kiezen van een offerte uit beeld
  // verdween -- en het leek alsof EVA de opdrachtgever niet meer kende.
  const herkendVoorOpdracht = {
    opdrachtgever: klantNaam || null,
    contactpersoonId,
    // Terugval op de naam die al aan het bericht hangt. Stond alleen de gelezen
    // lijst, en die komt van een aparte serveraanroep: laadt die traag of faalt
    // hij, dan zegt het opdrachtpaneel "contactpersoon niet herkend" terwijl er
    // gewoon een contactpersoon aan hangt.
    contactpersoonNaam:
      contactpersonen.find(c => c.id === contactpersoonId)?.naam
      ?? (b.contactpersoon?.naam as string | undefined)
      ?? null,
    factuuradres: factuuradresVoorstel,
  }

  const oordelen = useOordelen(route, b.soort as MailSoort | null, {
    klantId, contactpersoonId,
    contactpersoonEmail: velden.contactpersoon_email ?? null,
    contactpersoonTelefoon: velden.contactpersoon_telefoon ?? null,
    omschrijving, categorieId, werkmaatschappijId, werkmaatschappijVia: wmVia,
    aardVanHetWerk: (velden.aard_van_het_werk as string | null) ?? null,
    straat, huisnummer, postcode, stad, adresBevestigd,
    werkadresContactNaam: adres.contact.naam,
    werkadresContactTelefoon: adres.contact.telefoon,
    werkadresContactEmail: adres.contact.email,
    referentie,
    onzeOfferteReferentie: velden.onze_offerte_referentie ?? null,
    opdrachtReferentie, vveCode,
    aanvraagdatum: velden.aanvraagdatum ?? null,
    opdrachtdatum, deadline,
    gewensteStart: velden.gewenste_start ?? null,
    bedragExclBtw: velden.bedrag_excl_btw ?? null,
    mandaat, regie,
    factuuradresNaam: velden.factuuradres_naam ?? null,
    factuuradresStraat: velden.factuuradres_straat ?? null,
    factuuradresPostcode: velden.factuuradres_postcode ?? null,
    factuuradresPlaats: velden.factuuradres_plaats ?? null,
    opmerkingen, klantOpmerkingen,
    betrokkenen: (gekeurd?.betrokkenen ?? []) as unknown[],
    offerteDossierId: gekozenOfferte,
    meerwerkDossierId: gekozenMeerwerk,
    aangeraakt, zekerheid,
    // Wat er op het gekozen dossier staat; wijkt de mail af, dan wordt dat veld
    // oranje met beide waarden in de hovertekst.
    dossier: uitDossier ? {
      klant_naam: uitDossier.klantNaam,
      werkadres_straat: uitDossier.werkadresStraat,
      werkadres_huisnummer: uitDossier.werkadresHuisnummer,
      werkadres_postcode: uitDossier.werkadresPostcode,
      werkadres_stad: uitDossier.werkadresStad,
      categorie_voorstel: uitDossier.categorieNaam,
      vve_code: uitDossier.vveCode,
    } : null,
  })

  const compleet = magAfhandelen(oordelen)
  const ontbreekt = ontbrekendeVelden(oordelen)
  const topDuplicaat = detail.duplicaten[0]
  const heeftDuplicaatWaarschuwing = (topDuplicaat?.score ?? 0) >= DUPLICAAT_TWIJFEL

  // ── Acties ─────────────────────────────────────────────────────────────────

  async function aanmaken() {
    if (!klantId) return

    // Dit is de kern van de harde eis: nooit stil langs een duplicaat heen.
    if (heeftDuplicaatWaarschuwing) {
      const d = topDuplicaat
      const ok = await bevestig({
        titel: 'Lijkt al ingeschreven',
        omschrijving:
          `Dit bericht lijkt te horen bij ${d.dossiernummer ?? 'een bestaand dossier'}` +
          `${d.titel ? ` — ${d.titel}` : ''}${d.klantnaam ? ` (${d.klantnaam})` : ''}.\n\n` +
          `Waarom: ${d.redenen.join('; ')}.\n\n` +
          'Wil je tóch een nieuw dossier aanmaken?',
        bevestigLabel: 'Toch nieuw dossier',
        annuleerLabel: 'Annuleren',
        destructief: true,
      })
      if (!ok) return
    }

    setBezig(true)
    try {
      // Het samenstellen van de payload staat bij de panelen: het is een platte
      // afbeelding van de schermtoestand en hoort de leesbaarheid hier niet te
      // verdringen.
      const teVersturen = bouwVeldenVoorAanmaak({
        velden, categorieen, klantId, klantNaam, contactpersoonId, objectId, calculatorId,
        projectOmschrijving, omschrijving, straat, huisnummer, postcode, stad, adresBevestigd,
        werkadresContact: adres.contact,
        referentie, vveCode, categorieId, werkmaatschappijId, deadline, mandaat, regie,
        opmerkingen,
        factuuradres: factuuradresOvernemen ? factuuradresVoorstel : null,
        actie, fase,
        betrokkenen: (gekeurd?.betrokkenen ?? []) as never,
      })

      // ── Proef ─────────────────────────────────────────────────────────────
      // Eerst laten zien wat er precies weggeschreven wordt, en niets doen. De
      // bevestiging hieronder gaat daarmee over het werkelijke voorstel en niet
      // over een benadering ervan; ditzelfde resultaat is straks ook waartegen er
      // wordt teruggelezen.
      const proef = await proefDossierVanBericht(b.id, teVersturen, {
        scope: projectOmschrijving.scope.trim() || null,
        buitenScope: projectOmschrijving.buitenScope.trim() || null,
        aandachtspunten: projectOmschrijving.aandachtspunten.trim() || null,
      })

      if (proef.blokkades.length > 0) {
        await meld({
          titel: 'Dit kan nog niet aangemaakt worden',
          omschrijving: proef.blokkades.map(r => `- ${r}`).join('\n'),
        })
        return
      }

      const akkoord = await bevestig({
        titel: 'Dit wordt er aangemaakt',
        omschrijving: <Voorvertoning proef={proef} />,
        bevestigLabel: 'Aanmaken',
        annuleerLabel: 'Annuleren',
      })
      if (!akkoord) return

      const res = await maakDossierVanBericht(b.id, teVersturen, proef)

      if (!res.ok) { toast.error(res.error ?? 'Aanmaken mislukt'); return }

      // ── Teruglezen ────────────────────────────────────────────────────────
      // Wijkt er iets af, dan staan de bestanden bewust nog niet in de map: liever
      // een half dossier dan stukken onder het verkeerde project.
      if ((res.afwijkingen?.length ?? 0) > 0) {
        await meld({
          titel: 'Het dossier staat er, maar wijkt af van het voorstel',
          omschrijving: (
            <Afwijkingen
              afwijkingen={res.afwijkingen ?? []}
              bestandenGeplaatst={res.bestandenGeplaatst !== false}
            />
          ),
        })
      }

      toast.success(`Dossier ${res.dossiernummer ?? ''} aangemaakt`.trim())
      if (!res.bouw7Ok) {
        await meld({
          titel: 'Dossier staat in EVA, maar niet in Bouw7',
          omschrijving:
            `Het dossier is aangemaakt, maar de koppeling met Bouw7 gaf een fout:\n\n${res.bouw7Fout ?? 'onbekend'}\n\n` +
            'Je kunt dat later opnieuw proberen vanaf de dossierpagina.',
        })
      }
      // Naar de sectie waar het dossier werkelijk terechtkwam. Stond vast op
      // 'aanvraag'; sinds de fase te kiezen is zou dat op een opdracht- of
      // servicedeskdossier het verkeerde scherm openen. Niet op de fasenaam maar op
      // de kolommen: een servicedeskdossier hééft hoofdstatus 'aanvraag' en wordt
      // alleen aan zijn ladderwaarde herkend -- `dossierSegment` doet precies die
      // afweging al, en zonder die stap belandt een bon op /opdrachten en dus op 404.
      // `dossierId` is optioneel in het retourtype; zonder id is er niets om heen te springen —
      // dan blijft het scherm staan in plaats van naar /undefined te navigeren.
      const k = FASE_PLAATSINGEN[fase].kolommen
      const segment = dossierSegment(k.hoofdstatus, k.servicedesk_substatus)
      if (res.dossierId && segment) router.push(`/${segment}/${res.dossierId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aanmaken mislukt')
    } finally {
      setBezig(false)
    }
  }

  const koppelen = useKoppelen(b.id, setBezig)

  // ── Weergave ───────────────────────────────────────────────────────────────

  // Alle bezwaren, niet alleen de eerste. Stond op `redenen[0]`, waardoor je er
  // één oploste, op Aanmaken drukte en de volgende kreeg.
  const redenen = useMemo<string[]>(() => {
    const laatste = detail.log.find((l: any) => l.actie === 'beoordeeld')
    return laatste?.details?.redenen ?? []
  }, [detail.log])

  /** Kortlopende link naar een bijlage, voor de voorbeelden in het mailpaneel. */
  async function haalBijlageUrl(id: string): Promise<string | null> {
    const res = await getBijlageUrl(id)
    return res.ok && res.url ? res.url : null
  }


  // De zekerheid over het geheel: het gemiddelde van de velden die het dossier
  // dragen. Die drie bepalen of een aanvraag bruikbaar is; een perfect gelezen
  // telefoonnummer maakt een ontbrekend adres niet goed.
  const kernZekerheid = useMemo(() => {
    const kern = ['omschrijving', 'werkadres_straat', 'categorie_voorstel']
    const som = kern.reduce((a, k) => a + (zekerheid[k] ?? 0), 0)
    return Math.round((som / kern.length) * 100) / 100
  }, [zekerheid])

  /**
   * De velden die aandacht vragen, meest onzekere eerst.
   *
   * Alles onder de betrouwbaarheidsdrempel komt hier terecht, plus wat leeg is
   * gebleven terwijl het dossier het nodig heeft. De invoer is dezelfde toestand
   * als in het formulier ernaast -- twee plekken met dezelfde waarde die uit elkaar
   * kunnen lopen zou erger zijn dan geen tweede plek.
   */
  // De velden die aandacht vragen; het samenstellen ervan staat bij het paneel.
  const twijfelVelden = bouwTwijfelVelden({
    zekerheid, bewerkbaar, categorieen, werkmaatschappijen,
    klantId, klantNaam, setKlantNaam, setKlantZoek,
    omschrijving, setOmschrijving,
    straat, setStraat, huisnummer, setHuisnummer, adresBevestigd,
    controleerAdres,
    categorieId, setCategorieId, werkmaatschappijId, setWerkmaatschappijId,
  })

  return (
    // Zelfde container als de overige overzichtsschermen; zonder deze klasse plakt
    // de driekolomsindeling tegen de schermrand.
    <div className="eva-page-full" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {afgehandeld && (
        <AfgehandeldBalk
          status={b.status}
          dossiernummer={b.dossier?.dossiernummer ?? null}
          magSchrijven={magSchrijven}
          bezig={inActie}
          onHeropen={heropen}
        />
      )}

      {/* Drie kolommen, en alles wat bij een kolom hoort zit ook in die kolom. Stond
          het uitklapblok en de knoppenrij eerder los in de grid, dan vielen ze in een
          eigen cel: het blok belandde rechtsboven, de knoppen op een nieuwe regel
          linksonder, en de rechterkolom schoof onder het formulier. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 0.85fr) minmax(400px, 1.25fr) minmax(320px, 1fr)',
        gap: 14, alignItems: 'start',
      }}>

        {/* ── Links: waar EVA over twijfelt ──
            De mail stond hier eerst. Die lees je één keer; de velden waar EVA
            onzeker over is zijn waar de tijd in gaat, en die horen dus vooraan. */}
        <TwijfelPaneel
          zekerheid={kernZekerheid}
          soortLabel={b.soort ? (MAIL_SOORT_LABELS[b.soort as MailSoort] ?? b.soort) : 'Nog niet beoordeeld'}
          soortVertrouwen={b.soort_vertrouwen != null ? Number(b.soort_vertrouwen) : null}
          redenen={redenen}
          velden={twijfelVelden}
          afhandeling={{
            bewerkbaar, bezig: inActie, compleet,
            ontbreekt: ontbreekt.map(v => VELD_LABELS[v] ?? v),
            // Op de opdrachtroute wint een bestaande offerte en wordt er geen dossier
            // gemaakt; dan hoort die knop er ook niet te staan.
            onAanmaken: route === 'offerte_winnen' && !forceerNieuw ? null : aanmaken,
            onGeenAanvraag: geenAanvraag,
            onNegeren: negeren,
            onOpnieuwLezen: opnieuwLezen,
            medewerkers,
            calculatorId, setCalculatorId,
            actie, setActie,
            fase: route === 'offerte_winnen' && !forceerNieuw ? null : fase,
            setFase, faseBezwaar,
          }}
        />

        {/* ── Midden: wat ermee gebeurt ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── Midden: het voorstel ──
            Eén vaste kop op één vaste plek. Daaronder wisselt de inhoud met de
            route -- een opdracht wint een bestaande offerte, een aanvraag vult een
            formulier -- maar de kolom staat waar hij staat en heet hoe hij heet.
            Eerst verdween de hele kaart bij een opdracht en stond er iets anders,
            waardoor het scherm per bericht een ander scherm leek. */}
        <div style={kop}>Voorstel</div>


        {/* Eén formulier voor beide routes. Wat verschilt is de dossier-sectie
            en de kleur van de velden, niet welke velden er staan. */}
        <AanvraagFormulier
            oordelen={oordelen}
            bewerkbaar={bewerkbaar}
            categorieen={categorieen}
            werkmaatschappijen={werkmaatschappijen}
            medewerkers={medewerkers}
            waarden={{
              omschrijving, categorieId, werkmaatschappijId, referentie,
              opdrachtReferentie, vveCode, opdrachtdatum, deadline, mandaat, regie,
              opmerkingen, klantOpmerkingen,
            }}
            zetWaarde={zetWaarde}
            raakAan={raakAan}
            bericht={b}
            velden={velden}
            gekeurd={gekeurd}
            zekerheid={zekerheid}
            bijlagen={(detail.bijlagen ?? []).map((x: any) => ({
              bestandsnaam: x.bestandsnaam, rol: x.rol ?? null,
            }))}
            factuuradresVoorstel={factuuradresVoorstel}
            factuuradresOvernemen={factuuradresOvernemen}
            zetFactuuradresOvernemen={setFactuuradresOvernemen}
            klantId={klantId}
            klantNaam={klantNaam}
            zetKlant={(id: string | null, naam?: string) => { setKlantId(id); if (naam != null) setKlantNaam(naam) }}
            klantZoek={klantZoek}
            zetKlantZoek={setKlantZoek}
            klantOpties={klantOpties}
            wisOpties={() => setKlantOpties([])}
            contactpersonen={contactpersonen}
            contactpersoonId={contactpersoonId}
            zetContactpersoon={setContactpersoonId}
            adres={adres}
            projectOmschrijving={projectOmschrijving}
            zetProjectOmschrijving={setProjectOmschrijving}
            rollen={rollen}
          zetRol={(rol: RolSleutel, id: string) => setRollen(x => ({ ...x, [rol]: id }))}
          // Bij een opdracht staat de keuze waar de factuur heen gaat in het
          // dossierblok hierboven, want die hoort bij het bevestigen. Sectie
          // Facturering toont dan alleen wat er in de mail stond, met een
          // verwijzing: twee invoervelden voor hetzelfde gegeven is precies hoe de
          // twee schermen uit elkaar gingen lopen.
          verwijsFactuurkeuze={route === 'offerte_winnen' && !forceerNieuw}
          offerteDossierId={gekozenOfferte}
          termijnenActief={route === 'offerte_winnen' && !forceerNieuw}
          dossierSectie={
            // Meerwerk hoort bij een lopende opdracht, niet bij een nieuw dossier.
            // Dit blok stond er niet: de sectie zei dat EVA er een dossier van zou
            // maken, en de enige knop zat weggestopt rechts bij een duplicaat.
            b.soort === 'meerwerk' ? (
              <MeerwerkSectie
                kandidaten={detail.duplicaten
                  .filter((d: { soort: string }) => d.soort === 'meerwerk_kandidaat')
                  .map((d: Record<string, unknown>) => ({
                    dossierId: String(d.dossierId),
                    dossiernummer: (d.dossiernummer as string) ?? null,
                    titel: (d.titel as string) ?? null,
                    klantnaam: (d.klantnaam as string) ?? null,
                    score: Number(d.score),
                    redenen: (d.redenen as string[]) ?? [],
                  }))}
                bewerkbaar={bewerkbaar}
                gekozen={gekozenMeerwerk}
                onKies={setGekozenMeerwerk}
                onKoppel={id => void koppelen(id, 'meerwerk', 'Meerwerk op dit dossier')}
                bezig={inActie}
              />
            ) : route === 'offerte_winnen' && !forceerNieuw ? (
              <OpdrachtPaneel
                berichtId={b.id}
                kandidaten={detail.duplicaten}
                relatieId={klantId}
                bewerkbaar={bewerkbaar}
                herkend={herkendVoorOpdracht}
                werkadres={{ straat, huisnummer }}
                voorstel={{
                  opdrachtReferentie, opdrachtdatum,
                  klantOpmerkingen: klantOpmerkingen || null,
                }}
                voorgekozenDossierId={gekozenOfferte}
                onKeuze={setGekozenOfferte}
                onKlaar={dossierId => router.push(dossierHref(dossierId, 'opdracht'))}
              />
            ) : null
          }
        />

        <AndereWeg
          bewerkbaar={bewerkbaar}
          opdrachtroute={route === 'offerte_winnen'}
          forceerNieuw={forceerNieuw}
          setForceerNieuw={setForceerNieuw}
        />

        {kanTochOfferte && (
          <details
            open={offerteOpen}
            onToggle={e => setOfferteOpen((e.target as HTMLDetailsElement).open)}
            style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
            background: 'var(--surface)',
          }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Hoort dit toch bij een offerte van ons?
            </summary>
            <p style={{ ...klein, margin: '6px 0 10px' }}>
              {isRegie
                ? 'Deze opdracht wordt op nacalculatie afgerekend, dus EVA maakt er een nieuw dossier van. Blijkt het tóch het akkoord op een offerte, dan zet je die hier op gewonnen.'
                : 'EVA stelt een nieuw dossier voor. Hoort deze opdracht bij een offerte die wij al hebben uitgebracht, zet die dan hier op gewonnen.'}
            </p>
            <OpdrachtPaneel
              berichtId={b.id}
              kandidaten={detail.duplicaten}
              relatieId={klantId}
              bewerkbaar={bewerkbaar}
              herkend={herkendVoorOpdracht}
              werkadres={{ straat, huisnummer }}
              voorgekozenDossierId={gekozenOfferte}
              voorstel={{
                opdrachtReferentie: velden.opdracht_referentie ?? null,
                opdrachtdatum: velden.opdrachtdatum ?? ((b.ontvangen_op ?? '').slice(0, 10) || null),
                klantOpmerkingen: velden.klant_opmerkingen ?? null,
              }}
              onKlaar={dossierId => router.push(dossierHref(dossierId, 'opdracht'))}
            />
          </details>
        )}

        </div>

        {/* ── Rechts: waarop berust dit ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MailPaneel
          bericht={b}
          bijlagen={detail.bijlagen}
          groepsMails={detail.groepsMails}
          onOpenBijlage={openBijlage}
          haalBijlageUrl={haalBijlageUrl}
          magAntwoorden={magSchrijven}
        />

        <BeoordelingPaneel
          bericht={b}
          toelichting={detail.extractie?.toelichting ?? null}
          duplicaten={detail.duplicaten}
          bewerkbaar={bewerkbaar}
          bezig={bezig}
          onKoppel={koppelen}
          onKiesOfferte={kiesOfferte}
          objectTreffer={objectTreffer}
          objectId={objectId}
          setObjectId={setObjectId}
        />
        </div>
      </div>
    </div>
  )
}
