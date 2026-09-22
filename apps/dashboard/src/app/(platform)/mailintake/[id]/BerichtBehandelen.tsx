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
import { useWerkmaatschappij } from './panelen/gebruik-werkmaatschappij'
import { useWerkadres } from './panelen/gebruik-werkadres'
import { useWeglegActies } from './panelen/wegleg-acties'
import { klein, kop, veldStijl, Veld } from './panelen/velden'
import { FormSection } from '@/components/ui/form-field'

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
  const {
    straat, setStraat, huisnummer, setHuisnummer, postcode, setPostcode, stad, setStad,
    bevestigd: adresBevestigd, controleer: controleerAdres,
  } = useWerkadres({
    straat: velden.werkadres_straat ?? null,
    huisnummer: velden.werkadres_huisnummer ?? null,
    postcode: velden.werkadres_postcode ?? null,
    stad: velden.werkadres_stad ?? null,
    bewerkbaar,
  })

  const [regie, setRegie] = useState<boolean>(Boolean(velden.regie))
  const [factuuradresOvernemen, setFactuuradresOvernemen] = useState(true)

  const [mandaat, setMandaat] = useState<string>(
    velden.mandaat_bedrag != null ? String(velden.mandaat_bedrag) : '',
  )

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
  const [gekozenOfferte, setGekozenOfferte] = useState<string | null>(null)
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

  const compleet = Boolean(klantId && omschrijving.trim() && werkmaatschappijId && categorieId && straat && huisnummer && postcode && stad)
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

  async function koppelen(dossierId: string, soort: 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen', label: string) {
    // Bij meerwerk verandert er iets op het dossier zelf; dat hoort in de
    // bevestiging te staan en niet pas in de toast achteraf.
    const ok = await bevestig({
      titel: label,
      omschrijving: soort === 'meerwerk' ? (
        <span className="block">
          <span className="block">
            Het bericht wordt aan dit dossier gekoppeld en verdwijnt uit je postvak.
          </span>
          <span className="mt-2 block">
            Staat er precies één meerwerkregel open, dan zet EVA die op akkoord — met een
            bewakingscode naar Bouw7. Staat er geen of staan er meerdere, dan krijgt de
            projectleider een actie; EVA maakt zelf nooit een meerwerkregel aan.
          </span>
        </span>
      ) : 'Het bericht wordt aan dit dossier gekoppeld en verdwijnt uit je postvak.',
      bevestigLabel: 'Koppelen',
    })
    if (!ok) return
    setBezig(true)
    try {
      const res = await koppelBerichtAanDossier(b.id, dossierId, soort)
      if (!res.ok) { toast.error(res.error ?? 'Koppelen mislukt'); return }
      toast.success(res.melding ?? 'Gekoppeld')
      router.push('/mailintake')
    } finally {
      setBezig(false)
    }
  }

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

        {route === 'offerte_winnen' && !forceerNieuw ? (
          <OpdrachtPaneel
            berichtId={b.id}
            kandidaten={detail.duplicaten}
            relatieId={klantId}
            bewerkbaar={bewerkbaar}
            herkend={herkendVoorOpdracht}
            werkadres={{ straat, huisnummer }}
            voorstel={{
              opdrachtReferentie: velden.opdracht_referentie ?? null,
              opdrachtdatum: velden.opdrachtdatum ?? ((b.ontvangen_op ?? '').slice(0, 10) || null),
              klantOpmerkingen: velden.klant_opmerkingen ?? null,
            }}
            // Deze route wint een offerte; het dossier is daarna een opdracht.
            onKlaar={dossierId => router.push(dossierHref(dossierId, 'opdracht'))}
          />
        ) : null}

        {(route !== 'offerte_winnen' || forceerNieuw) ? (
        <Card style={{ padding: 16 }}>
        {/* Vaste secties in een vaste volgorde. Het waren losse velden achter
            elkaar; waar iets stond hing af van welke velden er toevallig waren,
            en dat is precies wat het scherm per bericht anders liet ogen.
            FormSection komt uit het design system, dus de koppen zien eruit als
            elk ander formulier in EVA. */}
        <FormSection title="Opdrachtgever">
          <Veld label="Opdrachtgever" score={zekerheid.klant_naam}>
            {klantId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{klantNaam}</span>
                {bewerkbaar && (
                  <Button variant="ghost" onClick={() => { setKlantId(null); setContactpersoonId(null) }}>
                    wijzigen
                  </Button>
                )}
              </div>
            ) : (
              <div>
                <input
                  style={veldStijl}
                  placeholder="Zoek op naam, adres of e-mailadres…"
                  value={klantZoek}
                  onChange={e => setKlantZoek(e.target.value)}
                  disabled={!bewerkbaar}
                />
                {klantOpties.length > 0 && (
                  <div style={{ marginTop: 4, border: '1px solid var(--border)', borderRadius: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {klantOpties.map(o => (
                      <button
                        key={o.id}
                        onClick={() => {
                          setKlantId(o.id); setKlantNaam(o.naam)
                          if (o.contactpersoon) setContactpersoonId(o.contactpersoon.id)
                          setKlantZoek(''); setKlantOpties([])
                        }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '6px 9px',
                          fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                        }}
                      >
                        {o.naam}
                        {o.contactpersoon && <span style={klein}> · {o.contactpersoon.naam}</span>}
                        {o.viaFactuuradres && <span style={klein}> · factuuradres: {o.viaFactuuradres}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Veld>

          {klantId && contactpersonen.length > 0 && (
            <Veld label="Contactpersoon" score={zekerheid.contactpersoon_naam}>
              <select
                style={veldStijl}
                value={contactpersoonId ?? ''}
                onChange={e => setContactpersoonId(e.target.value || null)}
                disabled={!bewerkbaar}
              >
                <option value="">— geen —</option>
                {contactpersonen.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
              </select>
            </Veld>
          )}

        </FormSection>

        <FormSection title="Het werk">
          <WerkzaamhedenBlok
            berichtId={b.id}
            opgeslagen={{
              scope: b.gevraagde_werkzaamheden ?? null,
              buitenScope: b.buiten_scope ?? null,
              aandachtspunten: b.aandachtspunten ?? null,
            }}
            bronnen={b.gevraagde_werkzaamheden_bronnen ?? null}
            gemist={b.gevraagde_werkzaamheden_gemist ?? null}
            waarden={projectOmschrijving}
            opWijzig={setProjectOmschrijving}
            bewerkbaar={bewerkbaar}
          />

          <Veld label="Omschrijving van het werk" score={zekerheid.omschrijving}>
            <input style={veldStijl} value={omschrijving} onChange={e => setOmschrijving(e.target.value)} disabled={!bewerkbaar} />
          </Veld>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* De zekerheid van het model telt hier niet. Volgt de werkmaatschappij
                uit de categorie, dan is het een regel en geen gok -- en dan hoort er
                geen 30% achter een veld dat gewoon klopt. Alleen bij "voorleggen"
                (Bouwkundig Onderhoud zonder duidelijke aard) blijft het onzeker. */}
            <Veld
              label="Werkmaatschappij"
              score={wmVia === 'categorie' || wmVia === 'aard' ? 1 : zekerheid.werkmaatschappij_voorstel}
            >
              <select style={veldStijl} value={werkmaatschappijId} onChange={e => setWerkmaatschappijId(e.target.value)} disabled={!bewerkbaar}>
                <option value="">— kies —</option>
                {werkmaatschappijen.map(w => <option key={w.id} value={w.id}>{w.naam}</option>)}
              </select>
            </Veld>
            <Veld label="Categorie" score={zekerheid.categorie_voorstel}>
              <select style={veldStijl} value={categorieId} onChange={e => setCategorieId(e.target.value ? Number(e.target.value) : '')} disabled={!bewerkbaar}>
                <option value="">— kies —</option>
                {categorieen.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Veld>
          </div>

        </FormSection>

        <FormSection title="Werkadres">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <Veld label="Straat" score={zekerheid.werkadres_straat}>
              <input style={veldStijl} value={straat} onChange={e => setStraat(e.target.value)} onBlur={controleerAdres} disabled={!bewerkbaar} />
            </Veld>
            <Veld label="Huisnummer" score={zekerheid.werkadres_huisnummer}>
              <input style={veldStijl} value={huisnummer} onChange={e => setHuisnummer(e.target.value)} onBlur={controleerAdres} disabled={!bewerkbaar} />
            </Veld>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <Veld label="Postcode" score={zekerheid.werkadres_postcode}>
              <input style={veldStijl} value={postcode} onChange={e => setPostcode(e.target.value)} onBlur={controleerAdres} disabled={!bewerkbaar} />
            </Veld>
            <Veld label="Plaats" score={zekerheid.werkadres_stad}>
              <input style={veldStijl} value={stad} onChange={e => setStad(e.target.value)} onBlur={controleerAdres} disabled={!bewerkbaar} />
            </Veld>
          </div>
          {adresBevestigd && <span style={{ ...klein, color: 'var(--su-700, #15803d)' }}>Adres bevestigd door de adresservice.</span>}

        </FormSection>

        <FormSection title="Kenmerken">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Veld label="Referentie klant" score={zekerheid.referentie}>
              <input style={veldStijl} value={referentie} onChange={e => setReferentie(e.target.value)} disabled={!bewerkbaar} />
            </Veld>
            <Veld label="VvE-code" score={zekerheid.vve_code}>
              <input style={veldStijl} value={vveCode} onChange={e => setVveCode(e.target.value)} disabled={!bewerkbaar} />
            </Veld>
            {isServicedesk && (
            <Veld label="Mandaat (excl. btw)" score={zekerheid.mandaat_bedrag}>
              <input
                style={veldStijl} value={mandaat} disabled={!bewerkbaar}
                onChange={e => setMandaat(e.target.value)}
                placeholder="Bedrag waarbinnen we mogen werken"
              />
              <span style={klein}>
                Alleen invullen als de bon een mandaat of budgetplafond noemt; een los bedrag is
                meestal de geschatte prijs.
              </span>
            </Veld>
          )}

          <Veld label="Deadline" score={zekerheid.deadline}>
              <input type="date" style={veldStijl} value={deadline ?? ''} onChange={e => setDeadline(e.target.value)} disabled={!bewerkbaar} />
            </Veld>
          </div>

          <Veld label="Opmerkingen">
            <textarea style={{ ...veldStijl, minHeight: 60 }} value={opmerkingen} onChange={e => setOpmerkingen(e.target.value)} disabled={!bewerkbaar} />
          </Veld>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <input
              type="checkbox" checked={regie} disabled={!bewerkbaar}
              onChange={e => setRegie(e.target.checked)} style={{ marginTop: 3 }}
            />
            <span>
              Regie — afrekenen op nacalculatie, geen aanneemsom
              {velden.regie_aanwijzing && (
                <span style={{ ...klein, display: 'block' }}>
                  Uit de opdracht: “{velden.regie_aanwijzing}”
                </span>
              )}
              {!velden.regie && (
                <span style={{ ...klein, display: 'block' }}>
                  EVA vond hier geen aanwijzing voor; zet het zelf aan als het toch regiewerk is.
                </span>
              )}
            </span>
          </label>

          {factuuradresVoorstel && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
              <input
                type="checkbox" checked={factuuradresOvernemen} disabled={!bewerkbaar}
                onChange={e => setFactuuradresOvernemen(e.target.checked)} style={{ marginTop: 3 }}
              />
              <span>
                Factuuradres uit de opdracht vastleggen bij deze opdrachtgever
                <span style={{ ...klein, display: 'block' }}>
                  {[factuuradresVoorstel.naam, factuuradresVoorstel.straat,
                    [factuuradresVoorstel.postcode, factuuradresVoorstel.plaats].filter(Boolean).join(' ')]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
            </label>
          )}
        </FormSection>
        </Card>
        ) : null}

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
