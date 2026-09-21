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

import { Button, Badge, Card, useDialogen } from '@/components/ui'
import { zoekRelaties, type OpdrachtgeverZoekResultaat } from '@/lib/dossiers/actions'
import { getContactpersonenVoorOrganisatie } from '@/lib/relaties/contactpersonen-actions'
import { zoekAdres } from '@/lib/adres/pdok'
// Er is geen route /dossiers/<id>: een dossier woont onder zijn sectie.
import { dossierHref } from '@/lib/dossiers/href'
import {
  maakDossierVanBericht, koppelBerichtAanDossier, negeerBericht,
  markeerGeenAanvraag, leesOpnieuw, getBijlageUrl, heropenBericht,
} from '@/lib/mailintake/actions'
import {
  MAIL_SOORT_LABELS, HERKEND_VIA_LABELS, DUPLICAAT_HARD, DUPLICAAT_TWIJFEL,
  bepaalRoute,
} from '@/lib/mailintake/types'
import OpdrachtPaneel from './panelen/OpdrachtPaneel'
import MailPaneel from './panelen/MailPaneel'
import BeoordelingPaneel from './panelen/BeoordelingPaneel'
import WerkzaamhedenBlok from './panelen/WerkzaamhedenBlok'
import { klein, zacht, kop, veldStijl, Veld } from './panelen/velden'

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
  detail, objectTreffer, werkmaatschappijen, categorieen, magSchrijven,
}: {
  detail: Detail
  objectTreffer: ObjectTreffer
  werkmaatschappijen: { id: string; naam: string }[]
  categorieen: { id: number; name: string }[]
  magSchrijven: boolean
}) {
  const router = useRouter()
  const { bevestig, meld, vraagTekst } = useDialogen()
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
  const [werkmaatschappijId, setWerkmaatschappijId] = useState(b.postbus?.standaard_werkmaatschappij_id ?? '')
  const [categorieId, setCategorieId] = useState<number | ''>('')
  const [referentie, setReferentie] = useState(velden.referentie ?? '')
  const [vveCode, setVveCode] = useState(velden.vve_code ?? '')
  const [deadline, setDeadline] = useState(velden.deadline ?? '')
  const [opmerkingen, setOpmerkingen] = useState(velden.opmerkingen ?? '')

  const [straat, setStraat] = useState(velden.werkadres_straat ?? '')
  const [huisnummer, setHuisnummer] = useState(velden.werkadres_huisnummer ?? '')
  const [postcode, setPostcode] = useState(velden.werkadres_postcode ?? '')
  const [stad, setStad] = useState(velden.werkadres_stad ?? '')
  const [adresBevestigd, setAdresBevestigd] = useState(false)

  const [regie, setRegie] = useState<boolean>(Boolean(velden.regie))
  const [factuuradresOvernemen, setFactuuradresOvernemen] = useState(true)

  const [mandaat, setMandaat] = useState<string>(
    velden.mandaat_bedrag != null ? String(velden.mandaat_bedrag) : '',
  )

  const [werkzaamheden, setWerkzaamheden] = useState<string>(b.gevraagde_werkzaamheden ?? '')

  // Voorkeur: wat er al aan het bericht hangt; anders de verse treffer.
  const [objectId, setObjectId] = useState<string | null>(
    b.object?.id ?? objectTreffer?.objectId ?? null,
  )

  const [bezig, setBezig] = useState(false)

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

  async function controleerAdres() {
    if (!(postcode && huisnummer) && !(straat && huisnummer && stad)) return
    try {
      const treffers = await zoekAdres({ postcode, huisnummer, straat, stad, rows: 1 })
      const t = treffers[0]
      if (t) {
        setStraat(t.straat || straat)
        setPostcode(t.postcode || postcode)
        setStad(t.stad || stad)
        setAdresBevestigd(true)
      } else {
        setAdresBevestigd(false)
        toast.error('Dit adres is niet gevonden — controleer postcode en huisnummer.')
      }
    } catch {
      setAdresBevestigd(false)
    }
  }

  // Welke route hoort bij dit bericht? Een opdracht maakt geen nieuw dossier maar
  // wint een bestaande offerte; het scherm toont dan een ander paneel.
  const offerteKandidaten = detail.duplicaten.filter(d => d.soort === 'offerte_match')
  const isRegie = gekeurd ? Boolean(gekeurd.regie) : Boolean(velden.regie)
  const route = bepaalRoute(b.soort, offerteKandidaten.length > 0, isRegie)
  const isServicedesk = b.soort === 'servicedeskbon'

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
    contactpersoonNaam: contactpersonen.find(c => c.id === contactpersoonId)?.naam ?? null,
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
      const res = await maakDossierVanBericht(b.id, {
        relatieId: klantId,
        contactpersoonId,
        objectId,
        gevraagdeWerkzaamheden: werkzaamheden.trim() || null,
        omschrijving: omschrijving.trim(),
        klantNaam,
        contactpersoonNaam: null,
        contactpersoonEmail: null,
        contactpersoonTelefoon: null,
        werkadresStraat: straat,
        werkadresHuisnummer: huisnummer,
        werkadresPostcode: postcode,
        werkadresStad: stad,
        adresBevestigd,
        referentie: referentie.trim() || null,
        onzeReferentie: velden.onze_offerte_referentie ?? null,
        vveCode: vveCode.trim() || null,
        bouw7CategorieId: categorieId === '' ? null : Number(categorieId),
        categorieNaam: categorieen.find(c => c.id === categorieId)?.name ?? null,
        werkmaatschappijId: werkmaatschappijId || null,
        aanvraagdatum: velden.aanvraagdatum ?? null,
        deadline: deadline || null,
        deadlineAfgeleid: false,
        opdrachtdatum: velden.opdrachtdatum ?? null,
        opdrachtReferentie: velden.opdracht_referentie ?? null,
        mandaatBedrag: mandaat.trim() ? Number(mandaat.replace(',', '.')) : null,
        regie,
        regieAanwijzing: velden.regie_aanwijzing ?? null,
        factuuradres: factuuradresOvernemen ? factuuradresVoorstel : null,
        klantOpmerkingen: velden.klant_opmerkingen ?? null,
        bedragExclBtw: velden.bedrag_excl_btw ?? null,
        spoed: Boolean(velden.spoed),
        opmerkingen: opmerkingen.trim() || null,
        meerdereWerkadressen: false,
        vertrouwen: {},
      })

      if (!res.ok) { toast.error(res.error ?? 'Aanmaken mislukt'); return }

      toast.success(`Dossier ${res.dossiernummer ?? ''} aangemaakt`.trim())
      if (!res.bouw7Ok) {
        await meld({
          titel: 'Dossier staat in EVA, maar niet in Bouw7',
          omschrijving:
            `Het dossier is aangemaakt, maar de koppeling met Bouw7 gaf een fout:\n\n${res.bouw7Fout ?? 'onbekend'}\n\n` +
            'Je kunt dat later opnieuw proberen vanaf de dossierpagina.',
        })
      }
      // maakDossierUitBericht loopt via maakAanvraag, dus dit dossier staat in de aanvraagfase.
      // `dossierId` is optioneel in het retourtype; zonder id is er niets om heen te springen —
      // dan blijft het scherm staan in plaats van naar /undefined te navigeren.
      if (res.dossierId) router.push(dossierHref(res.dossierId, 'aanvraag'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aanmaken mislukt')
    } finally {
      setBezig(false)
    }
  }

  async function koppelen(dossierId: string, soort: 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen', label: string) {
    const ok = await bevestig({
      titel: label,
      omschrijving: 'Het bericht wordt aan dit dossier gekoppeld en verdwijnt uit je postvak.',
      bevestigLabel: 'Koppelen',
    })
    if (!ok) return
    setBezig(true)
    try {
      const res = await koppelBerichtAanDossier(b.id, dossierId, soort)
      if (!res.ok) { toast.error(res.error ?? 'Koppelen mislukt'); return }
      toast.success('Gekoppeld')
      router.push('/mailintake')
    } finally {
      setBezig(false)
    }
  }

  async function negeren() {
    if (b.relatie?.id) {
      const ok = await bevestig({
        titel: 'Dit bericht komt van een bekende klant',
        omschrijving: `${b.relatie.naam} staat als opdrachtgever in EVA. Weet je zeker dat hier niets mee hoeft?`,
        bevestigLabel: 'Ja, negeren',
        destructief: true,
      })
      if (!ok) return
    }
    const reden = await vraagTekst({
      titel: 'Waarom kan dit genegeerd worden?',
      omschrijving: 'Eén regel is genoeg. Dit is later terug te lezen.',
      verplicht: true,
      meerregelig: true,
    })
    if (!reden) return

    setBezig(true)
    try {
      const res = await negeerBericht(b.id, reden)
      if (!res.ok) { toast.error(res.error ?? 'Negeren mislukt'); return }
      toast.success('Bericht genegeerd')
      router.push('/mailintake')
    } finally {
      setBezig(false)
    }
  }

  async function geenAanvraag() {
    const reden = await vraagTekst({
      titel: 'Geen aanvraag',
      omschrijving: 'Wat is het wél? (nieuwsbrief, factuur, reclame…)',
      verplicht: false,
    })
    setBezig(true)
    try {
      await markeerGeenAanvraag(b.id, reden ?? '')
      toast.success('Weggezet als geen aanvraag')
      router.push('/mailintake')
    } finally {
      setBezig(false)
    }
  }

  async function opnieuwLezen() {
    setBezig(true)
    try {
      const res = await leesOpnieuw(b.id)
      if (!res.ok) toast.error(res.error ?? 'Opnieuw lezen mislukt')
      else toast.success('Opnieuw gelezen')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  async function heropen() {
    setBezig(true)
    try {
      const res = await heropenBericht(b.id)
      if (!res.ok) toast.error(res.error ?? 'Heropenen mislukt')
      else { toast.success('Terug op de lijst'); router.refresh() }
    } finally {
      setBezig(false)
    }
  }

  /** Laat EVA de mail en de bijlagen opnieuw lezen voor de scope-samenvatting. */
  async function openBijlage(id: string) {
    const res = await getBijlageUrl(id)
    if (!res.ok || !res.url) { toast.error(res.error ?? 'Bijlage niet beschikbaar'); return }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  // ── Weergave ───────────────────────────────────────────────────────────────

  const redenVoorleggen = useMemo(() => {
    const laatste = detail.log.find((l: any) => l.actie === 'beoordeeld')
    const redenen: string[] = laatste?.details?.redenen ?? []
    return redenen[0] ?? null
  }, [detail.log])

  return (
    // Zelfde container als de overige overzichtsschermen; zonder deze klasse plakt
    // de driekolomsindeling tegen de schermrand.
    <div className="eva-page-full" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Waarom ligt dit hier? */}
      {redenVoorleggen && !afgehandeld && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, fontSize: 13,
          background: 'var(--wa-50, #fffbeb)', border: '1px solid var(--wa-200, #fde68a)',
          color: 'var(--wa-900, #78350f)',
        }}>
          <strong>Voorgelegd omdat:</strong> {redenVoorleggen}
        </div>
      )}
      {/* Wat Bouw7 nog mist. Dit is geen detail: zonder klant of vestiging wordt het
          project daar wél aangemaakt, maar leeg — en dat valt pas weken later op. */}
      {!afgehandeld && (b.bouw7_ontbreekt?.length ?? 0) > 0 && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, fontSize: 13,
          background: 'var(--da-50, #fef2f2)', border: '1px solid var(--da-200, #fecaca)',
          color: 'var(--da-900, #7f1d1d)',
        }}>
          <strong>Bouw7 kan hier nog geen net project van maken:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {(b.bouw7_ontbreekt as string[]).map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {afgehandeld && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, fontSize: 13,
          background: 'var(--n-100, #f3f4f6)', border: '1px solid var(--border)',
        }}>
          Dit bericht is afgehandeld{b.dossier?.dossiernummer ? ` — dossier ${b.dossier.dossiernummer}` : ''}.
          {b.status === 'genegeerd' && magSchrijven && (
            <Button variant="ghost" onClick={heropen} disabled={bezig} style={{ marginLeft: 8 }}>
              Terugzetten op de lijst
            </Button>
          )}
        </div>
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

        {/* ── Links: de mail ── */}
        <MailPaneel
          bericht={b}
          bijlagen={detail.bijlagen}
          groepsMails={detail.groepsMails}
          onOpenBijlage={openBijlage}
        />

        {/* ── Midden: wat ermee gebeurt ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

        {route === 'offerte_winnen' && !forceerNieuw && bewerkbaar && (
          <p style={klein}>
            Hoort deze opdracht bij geen enkele offerte van ons?{' '}
            <button
              onClick={() => setForceerNieuw(true)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                       color: 'hsl(var(--primary))', textDecoration: 'underline', font: 'inherit' }}
            >
              Maak er een nieuw dossier van
            </button>
          </p>
        )}

        {(route !== 'offerte_winnen' || forceerNieuw) ? (
        <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={kop}>Voorstel</div>

          {forceerNieuw && (
            <p style={{ ...klein, color: 'var(--wa-700, #b45309)' }}>
              EVA stelde voor om een bestaande offerte te winnen. Je maakt hier in plaats
              daarvan een nieuw dossier.{' '}
              <button
                onClick={() => setForceerNieuw(false)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                         color: 'hsl(var(--primary))', textDecoration: 'underline', font: 'inherit' }}
              >
                Terug naar de offerte
              </button>
            </p>
          )}

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

          <WerkzaamhedenBlok
            berichtId={b.id}
            opgeslagen={b.gevraagde_werkzaamheden ?? null}
            bronnen={b.gevraagde_werkzaamheden_bronnen ?? null}
            gemist={b.gevraagde_werkzaamheden_gemist ?? null}
            waarde={werkzaamheden}
            opWijzig={setWerkzaamheden}
            bewerkbaar={bewerkbaar}
          />

          <Veld label="Omschrijving van het werk" score={zekerheid.omschrijving}>
            <input style={veldStijl} value={omschrijving} onChange={e => setOmschrijving(e.target.value)} disabled={!bewerkbaar} />
          </Veld>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Veld label="Werkmaatschappij" score={zekerheid.werkmaatschappij_voorstel}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <Veld label="Straat" score={zekerheid.werkadres_straat}>
              <input style={veldStijl} value={straat} onChange={e => { setStraat(e.target.value); setAdresBevestigd(false) }} disabled={!bewerkbaar} />
            </Veld>
            <Veld label="Huisnummer" score={zekerheid.werkadres_huisnummer}>
              <input style={veldStijl} value={huisnummer} onChange={e => { setHuisnummer(e.target.value); setAdresBevestigd(false) }} onBlur={controleerAdres} disabled={!bewerkbaar} />
            </Veld>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <Veld label="Postcode" score={zekerheid.werkadres_postcode}>
              <input style={veldStijl} value={postcode} onChange={e => { setPostcode(e.target.value); setAdresBevestigd(false) }} onBlur={controleerAdres} disabled={!bewerkbaar} />
            </Veld>
            <Veld label="Plaats" score={zekerheid.werkadres_stad}>
              <input style={veldStijl} value={stad} onChange={e => { setStad(e.target.value); setAdresBevestigd(false) }} disabled={!bewerkbaar} />
            </Veld>
          </div>
          {adresBevestigd && <span style={{ ...klein, color: 'var(--su-700, #15803d)' }}>Adres bevestigd door de adresservice.</span>}

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

          {bewerkbaar && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <Button onClick={aanmaken} disabled={!compleet || bezig}>
                {bezig ? 'Bezig…' : 'Dossier aanmaken'}
              </Button>
            </div>
          )}
          {bewerkbaar && !compleet && (
            <span style={klein}>Vul opdrachtgever, omschrijving, werkmaatschappij, categorie en het volledige werkadres in.</span>
          )}
        </Card>
        ) : null}

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

        {/* Wegleggen kan altijd, welke route dit bericht ook heeft. Stonden eerst in
            het aanvraagformulier, waardoor ze op de opdrachtroute verdwenen -- en dan
            kun je een mail die geen aanvraag blijkt nergens meer wegzetten. */}
        {bewerkbaar && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: -4 }}>
            <Button variant="outline" onClick={geenAanvraag} disabled={bezig}>Geen aanvraag</Button>
            <Button variant="outline" onClick={negeren} disabled={bezig}>Negeren</Button>
            <Button variant="ghost" onClick={opnieuwLezen} disabled={bezig}>Opnieuw laten lezen</Button>
          </div>
        )}

        </div>

        {/* ── Rechts: waarop berust dit ── */}
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
  )
}
