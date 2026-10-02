import { Suspense } from 'react'
import { createAdminClient } from '@everts/database/server'
import { getDossierVerkoop, getDossierBewaking, type VerkoopTermijnStatus } from '@/lib/dossiers/actions'
import { getDossierMeerwerk } from '@/lib/dossiers/meerwerk'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, fmtPct, LegeNotitie } from './tab-ui'
import TermijnenBlok from './TermijnenBlok'
import VerkoopFacturenTabel from './VerkoopFacturenTabel'
import MeerwerkKlaarzetBlok from './MeerwerkKlaarzetBlok'
import ServicedeskRegiePaneel from './ServicedeskRegiePaneel'
import ServicedeskMargeBlok from './ServicedeskMargeBlok'
import VerkoopOverzicht, { groepeerBtw } from './VerkoopOverzicht'
import AfrekenwijzeKaart from './AfrekenwijzeKaart'
import { getAfrekenwijzeStand } from '@/lib/dossiers/afrekenwijze'
import { getTermijnAfwijking } from '@/lib/dossiers/termijnen'
import { getFactureerbareCodes } from '@/lib/dossiers/facturatie-codes'
import { getRegieFactuurvoorstel } from '@/lib/dossiers/servicedesk'
import { berekenContracttotaalVerkoop, overzichtRegels, splitsMeerwerk } from '@/lib/dossiers/contractwaarde'
import { Bouw7StandStrip } from '../Bouw7StandStrip'
import { bonBewakingscode, opRegie as rekentOpRegie, type DossierSectie } from '../types'

/** Label + kleur per termijnstatus. "Nog te factureren" en "Concept" vragen nog om actie. */
const TERMIJN_STATUS: Record<VerkoopTermijnStatus, { label: string; kleur: string }> = {
  nog_te_factureren: { label: 'Nog te factureren', kleur: 'var(--amber-700, #b45309)' },
  concept: { label: 'Concept — niet verzonden', kleur: 'var(--orange-700, #c2410c)' },
  verzonden: { label: 'Verzonden', kleur: 'var(--accent)' },
  betaald: { label: 'Betaald', kleur: 'var(--green-700, #15803d)' },
  gefactureerd: { label: 'Gefactureerd', kleur: 'var(--accent)' },
}

const InfoRij = ({ label, waarde }: { label: string; waarde: string | null }) => {
  if (!waarde) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--neutral-500)', minWidth: 160 }}>{label}</span>
      <span style={{ color: 'var(--neutral-800)', fontWeight: 500 }}>{waarde}</span>
    </div>
  )
}

const rond = (n: number) => Math.round(n * 100) / 100

/**
 * Twee blokken naast elkaar, allebei vanaf de bovenkant uitgelijnd.
 *
 * `auto-fit` en geen vaste `1fr 1fr`: is er maar één kind, dan krijgt dat de volle breedte in
 * plaats van een leeg spoor naast zich. En het meet de eigen ruimte, niet de vensterbreedte —
 * hoeveel er overblijft hangt hier van de zijbalk af, niet van het scherm.
 */
const Kolommen = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
    alignItems: 'start',
    gap: 16,
  }}>
    {children}
  </div>
)

/** Grid-cel. `minWidth: 0` is wat een brede tabel binnen zijn eigen schuifbalk houdt. */
const Kolom = ({ children }: { children: React.ReactNode }) => (
  <div style={{ minWidth: 0 }}>{children}</div>
)

/**
 * Loopt dit dossier op regie als hoofdroute? Dan is nacalculatie geen uitzondering maar de
 * manier waarop er gefactureerd wordt: het blok staat er altijd, ook leeg, en een termijnstaat
 * die niet bestaat hoeft niet gemeld te worden.
 *
 * Op een servicedeskbon volgt dat de facturatiemethode; op een opdracht alleen als iemand hem
 * bewust op regie zette (de schakelaar "Regieopdracht"). De standaardwaarde 'regie' van de kolom
 * telt daar niet — zie `opRegie()`. Op een aangenomen opdracht blijft het bestaande gedrag: het
 * blok verschijnt zodra er werkelijk factureerbare nacalculatie op het dossier staat.
 */
async function regieIsHoofdroute(dossierId: string): Promise<{ regie: boolean; mandaat: number | null }> {
  const db = createAdminClient()
  const { data } = await db
    .from('dossiers')
    .select('facturatiemethode, facturatiemethode_handmatig, bouw7_categorie_naam, servicedesk_substatus, mandaat_bedrag')
    .eq('id', dossierId)
    .maybeSingle()
  return {
    regie: rekentOpRegie(data),
    mandaat: data?.mandaat_bedrag != null ? Number(data.mandaat_bedrag) : null,
  }
}

/**
 * De vaste kostengroep van een servicedeskbon: `RW01` op regie, `AW01` op aangenomen werk.
 *
 * Staat op Facturatie in beeld omdat dít de post is waar alles op binnenkomt en waarvan wordt
 * afgerekend. Zonder die regel moet je op een ander tabblad opzoeken waar het geld eigenlijk
 * heen gaat. `inBouw7` is geen detail: een code die daar niet staat verzamelt niets en houdt de
 * bon op nul terwijl er wél gewerkt wordt.
 */
async function bonKostengroep(dossierId: string, sectie?: DossierSectie) {
  if (sectie !== 'servicedesk') return null
  const db = createAdminClient()
  const { data } = await db
    .from('dossiers')
    .select('regie_bewakingscode, regie_bouw7_chapter_id, facturatiemethode')
    .eq('id', dossierId)
    .maybeSingle()
  const code = (data?.regie_bewakingscode ?? '').trim()
  if (!code) return null
  return {
    code,
    naam: bonBewakingscode(data?.facturatiemethode).naam,
    inBouw7: data?.regie_bouw7_chapter_id != null,
  }
}

async function VerkoopInhoud({ dossierId, sectie }: { dossierId: string; sectie?: DossierSectie }) {
  // Alles wat bepaalt óf er iets te tonen valt, wordt vóór de lege staat opgehaald. Stond het
  // meerwerk daar eerst achter, dan bleef de tab leeg op een dossier met goedgekeurd meerwerk maar
  // zonder aanneemsom of termijnen — precies het geval waarin je juist iets wilt zien.
  const [data, schemaAfwijking, meerwerk, nacalculatieCodes, voorstel, route, afrekenwijze] = await Promise.all([
    getDossierVerkoop(dossierId),
    // Faalt dit (geen offerte, geen betalingsconditie), dan blijft de banner gewoon weg.
    getTermijnAfwijking(dossierId).catch(() => null),
    getDossierMeerwerk(dossierId).catch(() => null),
    // Goedkope DB-lezing; zegt alleen óf er nacalculatie is, niet hoeveel.
    getFactureerbareCodes(dossierId).catch(() => []),
    // De nacalculatie hoort in het contracttotaal, dus die moet hier aan de serverkant al staan.
    // Zwaarder dan de rest, maar het is Postgres (snapshots), geen Bouw7-aanroep — en het gaat mee
    // naar het paneel, zodat dat niet nog eens hoeft te lezen.
    getRegieFactuurvoorstel(dossierId).catch(() => null),
    regieIsHoofdroute(dossierId).catch(() => ({ regie: false, mandaat: null })),
    // De schakelaar Regieopdracht hoort alleen bij een opdracht; een bon heeft de zijne op Informatie.
    sectie === 'opdracht' ? getAfrekenwijzeStand(dossierId).catch(() => null) : Promise.resolve(null),
  ])
  const opRegie = route.regie
  // Marge (kosten naast opbrengst) op een bon, en op een regieopdracht: daar is het net zo goed
  // de vraag wat het werk opbrengt tegenover wat het kost.
  const toonMarge = sectie === 'servicedesk' || opRegie

  /* Op een bon staat bovenaan wat het gekost heeft naast wat eruit gaat. De kosten komen uit
   * dezelfde projectbewaking als het Management Dashboard, zodat de marge hier en daar hetzelfde
   * getal is. Alleen op servicedesk: op een opdracht staat dit verhaal op de Financieel-tab, en
   * daar hoort het ook — die heeft de opbouw per bewakingscode die een bon niet nodig heeft. */
  const [bewaking, kostengroep] = toonMarge
    ? await Promise.all([
        getDossierBewaking(dossierId).catch(() => null),
        bonKostengroep(dossierId, sectie).catch(() => null),
      ])
    : [null, null]

  // Wat er op de kostengroep van de bon geboekt staat. Uit dezelfde bewaking als de totalen, zodat
  // het getal naast "geboekte kosten" niet uit een andere bron komt.
  const groepGeboekt = kostengroep
    ? (bewaking?.hoofdstukken ?? [])
        .flatMap(h => h.regels)
        .filter(r => r.code === kostengroep.code)
        .reduce((som, r) => som + r.geboekteKosten, 0)
    : 0
  const bg = data.betaalgegevens

  const goedgekeurdeRegels = (meerwerk?.regels ?? []).filter(r => r.status === 'akkoord' || r.status === 'voltooid')
  // Regie en stelposten rekenen op werkelijke kosten af; hun bedrag staat pas vast als het werk
  // geboekt is. Ze krijgen dus nooit een termijn en horen in het nacalculatie-blok, niet hier.
  // `opTermijn` en niet `!opNacalculatie`: die laatste eist een bewakingscode, dus een regieregel
  // zónder code zou hier als termijnwerk in de lijst belanden terwijl hij nooit een termijn krijgt.
  const termijnMeerwerk = goedgekeurdeRegels.filter(r => r.opTermijn)
  const nacalculatieMeerwerk = goedgekeurdeRegels.length - termijnMeerwerk.length
  const heeftNacalculatie = nacalculatieCodes.length > 0

  // Is er nog helemaal niets, dan blijft de opmaak wel staan — contractwaarde, BTW-specificatie
  // en facturatiestand met nulbedragen. Zo zie je waar de cijfers komen te staan in plaats van
  // een lege plek. Alleen de reden komt erboven.
  const nogNiets = !data.beschikbaar && !bg && goedgekeurdeRegels.length === 0 && !heeftNacalculatie && !opRegie

  // Wie het meerwerk in het contracttotaal levert (EVA of het Bouw7-aggregaat) bepaalt
  // berekenContracttotaalVerkoop — dezelfde functie die het servicedeskbord voor de kaart gebruikt,
  // zodat kaart en tab hetzelfde getal tonen.
  const ct = berekenContracttotaalVerkoop({
    basis: data.totalen,
    goedgekeurdAantal: goedgekeurdeRegels.length,
    meerwerk: meerwerk?.totalen ?? null,
    nacalculatie: voorstel,
    opRegie,
  })
  const waarde = ct.waarde
  const nacalculatie = waarde.nacalculatie
  const meerwerkRegie = waarde.regie
  const splitsing = splitsMeerwerk(goedgekeurdeRegels, waarde)
  const evaBron = ct.evaBron

  let t = data.totalen
  let dk = data.termijnenDekking
  if (ct.meerwerk !== t.meerwerk || ct.contractTotaal !== t.contractTotaal) {
    t = { ...t, meerwerk: ct.meerwerk, contractTotaal: ct.contractTotaal, openstaand: Math.max(0, ct.contractTotaal - t.gefactureerd) }
  }

  /* — Waar de termijnen tegen gemeten worden —
   * Niet het contracttotaal: regie- en stelpostmeerwerk wordt op nacalculatie gefactureerd en komt
   * nooit in de termijnstaat. Telde je dat mee, dan meldde de dekkingcontrole een gat dat niemand
   * kan dichten — de banner bleef oranje zolang er regiewerk op het dossier stond.
   * Zonder EVA-regels is het Bouw7-aggregaat het enige getal dat er is en valt er niets te splitsen.
   *
   * En ook niet al het aangenomen meerwerk: alleen wat al een termijn heeft. De rest krijgt die pas
   * bij het klaarzetten in het meerwerkblok, of is door de administratie los gefactureerd. Telde het
   * mee, dan meldde de banner een gat dat er niet is (Vlietkinderen, sep 2026: € 15.244,88 "niet
   * in termijnen", terwijl de termijnen de aanneemsom op de cent dekten). */
  const heeftTermijn = (r: (typeof goedgekeurdeRegels)[number]) =>
    r.opTermijn && (r.in_termijnstaat || r.bouw7_term_id != null || (r.bouw7_term_ids?.length ?? 0) > 0)
  const meerwerkInStaat = rond(goedgekeurdeRegels.filter(heeftTermijn).reduce((s, r) => s + r.effectiefExcl, 0))
  const termijnGrondslag = evaBron ? rond(t.aanneemsom + meerwerkInStaat) : t.contractTotaal
  const regieBuitenTermijnen = evaBron && Math.abs(meerwerkRegie) > 0.005
  if (dk) {
    dk = {
      ...dk,
      volledig: Math.abs(dk.somBedrag - termijnGrondslag) <= 1,
      ontbreektBedrag: Math.max(0, termijnGrondslag - dk.somBedrag),
    }
  }

  /* — BTW-specificatie —
   * De termijnstaat is de enige bron met een BTW-tarief per bedrag. Meerwerk telt alleen mee zolang
   * het nog niet in de termijnstaat zit (anders zou het dubbel geteld worden); dat leiden we af uit
   * de som van de termijnen ten opzichte van het contracttotaal. */
  const btwRijen = data.termijnen.map((tm) => ({ pct: tm.btwPercentage, excl: tm.bedrag, btw: tm.btwBedrag }))
  // Meerwerk met een termijn zit al in de termijnen hierboven; per regel, niet meer afgeleid uit de
  // som van de staat.
  for (const r of goedgekeurdeRegels) {
    if (heeftTermijn(r)) continue
    // Wat in het nacalculatie-blok staat telt hier niet mee: het contracttotaal rekent dat werk uit
    // dat blok, dat zijn btw per factuurregel kent en niet per meerwerkregel. Zou het hier met het
    // kale regelbedrag staan, dan liep de btw-grondslag uit de pas met het totaal.
    if (r.opNacalculatie) {
      // Behalve wat een mandaat bóven het geboekte legt: dat staat niet in het blok maar wel in
      // het contracttotaal, dus hoort het in de grondslag.
      const aanvulling = rond(r.effectiefExcl - r.werkelijkExcl)
      if (aanvulling > 0) btwRijen.push({ pct: r.btwEffectief, excl: aanvulling, btw: rond(aanvulling * r.btwEffectief / 100) })
      continue
    }
    btwRijen.push({ pct: r.btwEffectief, excl: r.effectiefExcl, btw: rond(r.effectiefIncl - r.effectiefExcl) })
  }
  const btwGroepen = groepeerBtw(btwRijen)
  const btwGrondslag = rond(btwGroepen.reduce((s, g) => s + g.grondslag, 0))
  const btwTotaal = rond(btwGroepen.reduce((s, g) => s + g.btw, 0))
  // Deel van het contract waar (nog) geen tarief bij hoort — meestal werk dat nog niet in de
  // termijnstaat staat. Dan is het totaal incl. BTW een ondergrens en zeggen we dat er ook bij.
  const zonderTarief = rond(Math.max(0, t.contractTotaal - btwGrondslag))
  const totaalExcl = rond(Math.max(t.contractTotaal, btwGrondslag))
  const totaalIncl = rond(totaalExcl + btwTotaal)

  /* — Facturatiestand —
   * `totalen.gefactureerd` is incl. BTW zodra er facturen zijn; hier splitsen we het uit zodat het
   * naast een contracttotaal excl. BTW gelegd kan worden. Zonder facturen valt het terug op de
   * gerealiseerde omzet uit Bouw7 (excl. BTW), en blijft de BTW-kolom leeg. */
  const heeftFacturen = data.facturen.length > 0
  const factuurExcl = rond(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.bedragExcl : f.bedragExcl), 0))
  const factuurBtw = rond(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.btwBedrag : f.btwBedrag), 0))
  const factuurIncl = rond(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.bedrag : f.bedrag), 0))
  const gefactureerdExcl = heeftFacturen ? factuurExcl : t.gefactureerd
  const openstaandExcl = rond(Math.max(0, t.contractTotaal - gefactureerdExcl))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Bouw7StandStrip
        dossierId={dossierId}
        tab="verkoop"
        opgehaaldOp={data.stand.opgehaaldOp}
        ontbreekt={data.stand.ontbreekt}
        fout={data.stand.fout}
      />
      {afrekenwijze && (
        <AfrekenwijzeKaart dossierId={dossierId} stand={afrekenwijze} geboekt={splitsing.regiewerk} />
      )}
      {toonMarge && (
        <ServicedeskMargeBlok
          dossierId={dossierId}
          initieel={voorstel}
          geboekteKosten={bewaking?.totalen.geboekteKosten ?? 0}
          prognoseKosten={bewaking?.totalen.prognose ?? 0}
          opRegie={opRegie}
          contractwaarde={t.contractTotaal}
          kostengroep={kostengroep}
          kostengroepGeboekt={groepGeboekt}
        />
      )}
      {nogNiets && (
        <LegeNotitie losstaand>
          Nog geen verkoopgegevens: dit dossier heeft geen Bouw7-koppeling, of er zijn nog geen
          termijnen, facturen, goedgekeurd meerwerk of betaalgegevens.
        </LegeNotitie>
      )}
      {/* Contractwaarde en facturatiestand naast de facturen die er al liggen: die gaan over
          hetzelfde geld, en onder elkaar stonden ze een scherm uit elkaar. */}
      <Kolommen>
        <Kolom>
          <VerkoopOverzicht
            regels={overzichtRegels({
              opRegie, aanneemsom: t.aanneemsom, splitsing, evaBron, bouw7Meerwerk: t.meerwerk,
            })}
            contractTotaal={t.contractTotaal}
            mandaat={opRegie ? route.mandaat : null}
            btwGroepen={btwGroepen}
            zonderTarief={zonderTarief}
            totaalExcl={totaalExcl}
            btwTotaal={btwTotaal}
            totaalIncl={totaalIncl}
            geenTermijnstaat={data.termijnen.length === 0}
            meerwerkUitEva={!goedgekeurdeRegels.every(heeftTermijn)}
            facturatie={{
              heeftFacturen, excl: gefactureerdExcl, btw: factuurBtw, incl: factuurIncl, openstaand: openstaandExcl,
            }}
          />
        </Kolom>
        <Kolom>
          {/* Verkoopfacturen */}
          <Card>
            <CardHeader>Verkoopfacturen</CardHeader>
            <CardBody style={{ padding: 0, overflowX: 'auto' }}>
                <VerkoopFacturenTabel facturen={data.facturen} />
                {data.facturen.length === 0 && (
                  <LegeNotitie>Nog geen verkoopfacturen op dit dossier.</LegeNotitie>
                )}
            </CardBody>
          </Card>
        </Kolom>
      </Kolommen>

      {/* De twee routes waarlangs een dossier gefactureerd wordt, naast elkaar. Staat er geen
          nacalculatie op dit dossier, dan neemt de termijnstaat de volle breedte. */}
      <Kolommen>
        {/* Termijnen. Rekent dit dossier op regie af en kent Bouw7 geen termijnstaat, dan blijft
            deze kolom leeg: "Termijnen zijn niet beschikbaar voor dit project" is daar geen
            mededeling maar ruis — die route bestaat er simpelweg niet. Staan er wél termijnen
            (gemengd werk), dan hoor je ze te zien. */}
        {(data.termijnenBeschikbaar || !opRegie) && (
        <Kolom>
          <Card>
            <CardHeader>Termijnen</CardHeader>
            <CardBody style={{ padding: 0, overflowX: 'auto' }}>
              {/* Dekkingcheck-banner */}
              {dk && (
                <div style={{
                  margin: '0 0 0 0',
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--neutral-100)',
                  fontSize: 12.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: dk.volledig
                    ? 'var(--green-50, #f0fdf4)'
                    : data.termijnen.length === 0
                      ? 'var(--orange-50, #fff7ed)'
                      : 'var(--amber-50, #fffbeb)',
                  color: dk.volledig
                    ? 'var(--green-700, #15803d)'
                    : data.termijnen.length === 0
                      ? 'var(--orange-700, #c2410c)'
                      : 'var(--amber-700, #b45309)',
                }}>
                  {dk.volledig ? (
                    <>
                      <span>✓</span>
                      <span>
                        Volledig gedekt — termijnen dekken de volledige aanneemsom van {fmt(termijnGrondslag)}
                        {regieBuitenTermijnen ? `, exclusief ${fmt(meerwerkRegie)} regie en stelposten` : ''}
                      </span>
                    </>
                  ) : data.termijnen.length === 0 ? (
                    <>
                      <span>⚠</span>
                      <span>
                        Geen termijnen aangemaakt voor een aanneemsom van {fmt(termijnGrondslag)}
                        {regieBuitenTermijnen ? `, exclusief ${fmt(meerwerkRegie)} regie en stelposten` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>⚠</span>
                      {/* Het percentage uit de bedragen, niet uit de termijnpercentages: die tellen
                          tegen de oorspronkelijke staat op en gaven "nog € 15.244,88 (0 %)". */}
                      <span>
                        {dk.somBedrag > termijnGrondslag
                          ? <>Termijnen dekken {fmt(dk.somBedrag)}, {fmt(rond(dk.somBedrag - termijnGrondslag))} méér dan de aanneemsom van {fmt(termijnGrondslag)}. Staat er meerwerk als losse termijn in Bouw7 die niet aan een meerwerkregel hangt, dan verklaart dat het verschil</>
                          : <>Termijnen dekken {fmt(dk.somBedrag)} van {fmt(termijnGrondslag)} aanneemsom
                            {' '}— nog {fmt(dk.ontbreektBedrag)}
                            {termijnGrondslag > 0 ? ` (${fmtPct(dk.ontbreektBedrag / termijnGrondslag * 100)})` : ''} niet in termijnen opgenomen</>}
                        {regieBuitenTermijnen ? `. ${fmt(meerwerkRegie)} regie en stelposten telt niet mee: dat gaat via de nacalculatie` : ''}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Wijkt wat er in Bouw7 staat af van de betalingsconditie op de offerte, dan is dat
                  een echte fout in wording: je factureert dan een ander schema dan de klant heeft
                  geaccepteerd. Daarom zichtbaar in plaats van stil. */}
              {schemaAfwijking?.afwijking && (
                <div style={{
                  display: 'flex', gap: 8, padding: '8px 12px', fontSize: 12.5,
                  borderBottom: '1px solid var(--neutral-100)',
                  color: 'var(--orange-700, #c2410c)',
                }}>
                  <span>⚠</span>
                  <span>
                    {schemaAfwijking.afwijking}
                    {schemaAfwijking.conditieNaam ? ` (offerte: ${schemaAfwijking.conditieNaam})` : ''}
                    {' '}Controleer wat er met de klant is afgesproken voordat je een termijn klaarzet.
                  </span>
                </div>
              )}

              {/* De termijnstaat houdt zijn opmaak ook als Bouw7 er (nog) geen kent: kolomkoppen
                  en een nulregel. Waarom hij leeg is staat eronder. */}
              <TermijnenBlok
                dossierId={dossierId}
                termijnen={data.termijnen}
                schemaMogelijk={data.termijnenBeschikbaar}
              />
              {!data.termijnenBeschikbaar && (
                <LegeNotitie>Termijnen zijn niet beschikbaar voor dit project.</LegeNotitie>
              )}
            </CardBody>
          </Card>
        </Kolom>
        )}
        {/* Regiewerk. Op een dossier dat op regie afrekent is dit de factuurroute en staat het blok
            er altijd — ook leeg, want dit is de plek waar je de factuur opbouwt. Elders is regie de
            uitzondering en verschijnt het alleen als er factureerbare nacalculatie is. */}
        {(heeftNacalculatie || opRegie) && (
          <Kolom>
            <ServicedeskRegiePaneel
              dossierId={dossierId}
              verbergAlsLeeg={!opRegie}
              isHoofdroute={opRegie}
              initieel={voorstel}
            />
          </Kolom>
        )}
      </Kolommen>

      {/* Meerwerk in de termijnstaat: aanvinken en klaarzetten. Of iets al gefactureerd is
          controleert het blok zelf live in Bouw7 (zie lib/dossiers/meerwerk-facturatie.ts). */}
      {termijnMeerwerk.length > 0 && (
        <Card>
          <CardHeader>Meerwerk in termijnstaat</CardHeader>
          <CardBody style={{ padding: 0, overflowX: 'auto' }}>
            <MeerwerkKlaarzetBlok
              dossierId={dossierId}
              regels={termijnMeerwerk.map(r => ({
                id: r.id,
                // Het nummer waaronder Bouw7 het meerwerk kent; bij import wijkt dat af van het volgnummer.
                code: r.bouw7_nummer ?? r.bewakingscode ?? `MW${String(r.volgnummer).padStart(2, '0')}`,
                omschrijving: r.omschrijving,
                // Wat er werkelijk in de termijnstaat komt, niet wat er op de meerwerkregel is
                // aangevinkt. Zie `termijnVerwerking` in lib/dossiers/meerwerk.ts.
                verwerking: r.termijnVerwerking.soort === 'eigen_termijnstaat' ? 'Eigen termijnstaat'
                  : r.termijnVerwerking.soort === 'volgt_offerte'
                    ? `${r.termijnVerwerking.aantal} termijnen · ${r.termijnVerwerking.schema.map(s => `${s.percentage}%`).join('/')}`
                    : '1 termijn',
                excl: r.effectiefExcl,
                incl: r.effectiefIncl,
              }))}
              voetnoot={nacalculatieMeerwerk > 0
                ? `${nacalculatieMeerwerk} regel${nacalculatieMeerwerk === 1 ? '' : 's'} rekent op werkelijke kosten af en staat hierboven bij de nacalculatie.`
                : undefined}
            />
          </CardBody>
        </Card>
      )}

      {/* Betaalgegevens klant */}
      {bg && (
        <Card>
          <CardHeader>Betaalgegevens klant</CardHeader>
          <CardBody>
            <InfoRij label="Betaaltermijn" waarde={bg.betaaltermijn_dagen != null ? `${bg.betaaltermijn_dagen} dagen` : null} />
            <InfoRij label="Facturatie-e-mail" waarde={bg.facturatie_email} />
            <InfoRij label="Inkoopnr. verplicht" waarde={bg.inkoopnummer_verplicht ? 'Ja' : 'Nee'} />
            <InfoRij label="Kredietlimiet" waarde={bg.kredietlimiet != null ? fmt(bg.kredietlimiet) : null} />
            {bg.g_rekening_tekst && (
              <InfoRij label="G-rekening" waarde={`${bg.g_rekening_tekst}${bg.g_rekening_percentage != null ? ` (${bg.g_rekening_percentage}%)` : ''}`} />
            )}
          </CardBody>
        </Card>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', lineHeight: 1.5 }}>
        Live uit Bouw7 (termijnen + verkoopfacturen) en EVA (betaalgegevens klant).
      </div>
    </div>
  )
}

export function VerkoopTab({ dossierId, sectie }: { dossierId: string; sectie?: DossierSectie }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)' }}>
      <Suspense fallback={<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SkeletonCard /><SkeletonCard /></div>}>
        <VerkoopInhoud dossierId={dossierId} sectie={sectie} />
      </Suspense>
    </div>
  )
}
