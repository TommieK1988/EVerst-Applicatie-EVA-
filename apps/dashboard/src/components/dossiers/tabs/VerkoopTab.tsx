import { Suspense } from 'react'
import { createAdminClient } from '@everts/database/server'
import { getDossierVerkoop, getDossierBewaking, type VerkoopTermijnStatus } from '@/lib/dossiers/actions'
import { getDossierMeerwerk } from '@/lib/dossiers/meerwerk'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, fmtPct, TH, TD, LegeRij, LegeNotitie } from './tab-ui'
import TermijnenBlok from './TermijnenBlok'
import VerkoopFacturenTabel from './VerkoopFacturenTabel'
import MeerwerkKlaarzetBlok from './MeerwerkKlaarzetBlok'
import ServicedeskRegiePaneel from './ServicedeskRegiePaneel'
import ServicedeskMargeBlok from './ServicedeskMargeBlok'
import { getTermijnAfwijking } from '@/lib/dossiers/termijnen'
import { getFactureerbareCodes } from '@/lib/dossiers/facturatie-codes'
import { getRegieFactuurvoorstel } from '@/lib/dossiers/servicedesk'
import { berekenContractwaarde, splitsMeerwerk } from '@/lib/dossiers/contractwaarde'
import { Bouw7StandStrip } from '../Bouw7StandStrip'
import { bonBewakingscode, type DossierSectie } from '../types'

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

/** Kopregel binnen het overzichtsblok — scheidt contractwaarde, BTW en facturatiestand. */
const SectieRij = ({ titel, eerste }: { titel: string; eerste?: boolean }) => (
  <tr>
    <td
      colSpan={4}
      style={{
        padding: eerste ? '10px 12px 4px' : '16px 12px 4px',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        color: 'var(--neutral-500)',
        borderTop: eerste ? undefined : '1px solid var(--neutral-100)',
      }}
    >
      {titel}
    </td>
  </tr>
)

type BtwGroep = { pct: number | null; grondslag: number; btw: number }

/** Tel grondslag en BTW per tarief op. Regels zonder bekend tarief komen in een eigen groep. */
function groepeerBtw(rijen: { pct: number | null; excl: number; btw: number }[]): BtwGroep[] {
  const groepen = new Map<string, BtwGroep>()
  for (const r of rijen) {
    if (r.excl === 0 && r.btw === 0) continue
    const sleutel = r.pct == null ? 'onbekend' : String(r.pct)
    const g = groepen.get(sleutel) ?? { pct: r.pct, grondslag: 0, btw: 0 }
    g.grondslag = rond(g.grondslag + r.excl)
    g.btw = rond(g.btw + r.btw)
    groepen.set(sleutel, g)
  }
  // Hoogste tarief eerst; onbekend tarief onderaan.
  return Array.from(groepen.values()).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
}

/**
 * Loopt dit dossier op regie als hoofdroute? Dan is nacalculatie geen uitzondering maar de
 * manier waarop er gefactureerd wordt: het blok staat er altijd, ook leeg, en een termijnstaat
 * die niet bestaat hoeft niet gemeld te worden.
 *
 * Bewust beperkt tot servicedesk. Op een opdracht is `facturatiemethode` vandaag betekenisloos:
 * de kolom staat standaard op 'regie' en er is geen scherm waar iemand hem bewust zet
 * (`ServicedeskInfoPaneel` rendert alleen op servicedesk). Sturen op die waarde zou op élke
 * opdracht een leeg paneel opleveren. Daar blijft het bestaande gedrag gelden: het blok
 * verschijnt zodra er werkelijk factureerbare nacalculatie op het dossier staat.
 */
async function regieIsHoofdroute(dossierId: string, sectie?: DossierSectie): Promise<boolean> {
  if (sectie !== 'servicedesk') return false
  const db = createAdminClient()
  const { data } = await db.from('dossiers').select('facturatiemethode').eq('id', dossierId).maybeSingle()
  return (data?.facturatiemethode ?? 'regie') === 'regie'
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
  const [data, schemaAfwijking, meerwerk, nacalculatieCodes, voorstel, opRegie] = await Promise.all([
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
    regieIsHoofdroute(dossierId, sectie).catch(() => false),
  ])

  /* Op een bon staat bovenaan wat het gekost heeft naast wat eruit gaat. De kosten komen uit
   * dezelfde projectbewaking als het Management Dashboard, zodat de marge hier en daar hetzelfde
   * getal is. Alleen op servicedesk: op een opdracht staat dit verhaal op de Financieel-tab, en
   * daar hoort het ook — die heeft de opbouw per bewakingscode die een bon niet nodig heeft. */
  const [bewaking, kostengroep] = sectie === 'servicedesk'
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
  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
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

  // EVA-native meerwerkregels zijn leidend voor het meerwerk in het contracttotaal; valt terug op het
  // Bouw7-aggregaat uit getDossierVerkoop wanneer er geen goedgekeurde EVA-regels zijn.
  //
  // De voorwaarde kijkt naar het AANTAL regels, niet naar het bedrag. Bij per saldo minderwerk is de
  // som negatief, en dan zou "bedrag > 0" het Bouw7-getal laten staan terwijl EVA de waarheid heeft.
  const evaLeidend = goedgekeurdeRegels.length > 0
  const meerwerkAangenomen = meerwerk?.totalen.goedgekeurdAangenomenExcl ?? 0

  // Zelfde berekening als het Informatie-tab; de opbouw staat in berekenContractwaarde.
  const waarde = berekenContractwaarde({
    aanneemsom: data.totalen.aanneemsom,
    meerwerk: meerwerk?.totalen ?? null,
    nacalculatie: voorstel,
  })
  const nacalculatie = waarde.nacalculatie
  const meerwerkRegie = waarde.regie
  const meerwerkEva = waarde.meerwerk
  const splitsing = splitsMeerwerk(goedgekeurdeRegels, waarde)
  /* Leidt EVA het meerwerk in dit overzicht? Ja zodra er goedgekeurde regels zijn, en ook zodra er
   * nacalculatie op het dossier staat: die komt deels uit stelposten die helemaal geen meerwerkregel
   * zijn, en dan is er niets waar het Bouw7-aggregaat op terug kan vallen. */
  const evaBron = evaLeidend || Math.abs(nacalculatie) > 0.005

  let t = data.totalen
  let dk = data.termijnenDekking
  if (evaBron && Math.abs(meerwerkEva - t.meerwerk) > 0.005) {
    const contractTotaal = rond(t.aanneemsom + meerwerkEva)
    t = { ...t, meerwerk: meerwerkEva, contractTotaal, openstaand: Math.max(0, contractTotaal - t.gefactureerd) }
  }

  /* — Waar de termijnen tegen gemeten worden —
   * Niet het contracttotaal: regie- en stelpostmeerwerk wordt op nacalculatie gefactureerd en komt
   * nooit in de termijnstaat. Telde je dat mee, dan meldde de dekkingcontrole een gat dat niemand
   * kan dichten — de banner bleef oranje zolang er regiewerk op het dossier stond.
   * Zonder EVA-regels is het Bouw7-aggregaat het enige getal dat er is en valt er niets te splitsen. */
  const termijnGrondslag = evaBron ? rond(t.aanneemsom + meerwerkAangenomen) : t.contractTotaal
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
  const termijnSom = rond(data.termijnen.reduce((s, tm) => s + tm.bedrag, 0))
  // Meten tegen de termijngrondslag, niet tegen het contracttotaal: regiemeerwerk hoort daar niet
  // in en zou de staat anders altijd als "meerwerk zit er nog niet in" laten gelden.
  const meerwerkInTermijnstaat = meerwerkAangenomen > 0 && termijnSom >= termijnGrondslag - 1
  const btwRijen = data.termijnen.map((tm) => ({ pct: tm.btwPercentage, excl: tm.bedrag, btw: tm.btwBedrag }))
  // Zit het aangenomen meerwerk al in de termijnen, dan is alleen het regiedeel nog niet geteld.
  for (const r of goedgekeurdeRegels) {
    if (meerwerkInTermijnstaat && r.opTermijn) continue
    // Wat in het nacalculatie-blok staat telt hier niet mee: het contracttotaal rekent dat werk uit
    // dat blok, dat zijn btw per factuurregel kent en niet per meerwerkregel. Zou het hier met het
    // kale regelbedrag staan, dan liep de btw-grondslag uit de pas met het totaal.
    if (r.opNacalculatie) continue
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
  const btwBekend = btwGroepen.length > 0        // is er überhaupt één bedrag met een tarief?
  const btwOnvolledig = zonderTarief > 0.5       // centen-verschillen zijn geen echte gaten

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
      {sectie === 'servicedesk' && (
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
          {/* Overzicht: contractwaarde, BTW-specificatie per tarief en facturatiestand */}
          <Card>
            <CardHeader>Overzicht</CardHeader>
            <CardBody style={{ padding: 0, overflowX: 'auto' }}>
              <table style={tabel}>
                <thead>
                  <tr>
                    <TH />
                    <TH right breedte={150}>Excl. BTW</TH>
                    <TH right breedte={130}>BTW</TH>
                    <TH right breedte={150}>Incl. BTW</TH>
                  </tr>
                </thead>
                <tbody>
                  <SectieRij titel="Contractwaarde" eerste />
                  <tr>
                    <TD wrap>Aanneemsom</TD>
                    <TD right>{fmt(t.aanneemsom, true)}</TD>
                    <TD right kleur="var(--neutral-400)">—</TD>
                    <TD right kleur="var(--neutral-400)">—</TD>
                  </tr>
                  {/* Meerwerk gesplitst zodra EVA de regels kent: aangenomen werk gaat via de
                      termijnstaat, regie en stelposten via de nacalculatie. Dat verschil bepaalt waar
                      het bedrag terechtkomt, dus het hoort zichtbaar te zijn; en meer- en minderwerk
                      apart, omdat een saldo verbergt hoeveel er de ene en de andere kant op ging. */}
                  {/* Altijd alle vier, ook op nul: dan zie je in één oogopslag dat er géén
                      minderwerk is, in plaats van te moeten raden of een regel ontbreekt. */}
                  {([
                    ['Goedgekeurd minderwerk — aangenomen', 'via termijnen', splitsing.minderwerkAangenomen],
                    ['Goedgekeurd meerwerk — aangenomen', 'via termijnen', splitsing.meerwerkAangenomen],
                    ['Goedgekeurd minderwerk — regie en stelposten', 'via nacalculatie', splitsing.minderwerkRegie],
                    ['Goedgekeurd meerwerk — regie en stelposten', 'via nacalculatie', splitsing.meerwerkRegie],
                  ] as const).map(([label, route, bedrag]) => (
                    <tr key={label}>
                      <TD wrap>
                        {label}
                        <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>{route}</span>
                      </TD>
                      <TD right accent={Math.abs(bedrag) > 0.005} kleur={Math.abs(bedrag) > 0.005 ? undefined : 'var(--neutral-400)'}>{fmt(bedrag, true)}</TD>
                      <TD right kleur="var(--neutral-400)">—</TD>
                      <TD right kleur="var(--neutral-400)">—</TD>
                    </tr>
                  ))}
                  {/* Zonder EVA-regels is er alleen het Bouw7-aggregaat: dat valt niet te splitsen. */}
                  {!evaBron && Math.abs(t.meerwerk) > 0.005 && (
                    <tr>
                      <TD wrap>
                        Goedgekeurd meer-/minderwerk
                        <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>uit Bouw7, niet uitgesplitst</span>
                      </TD>
                      <TD right accent>{fmt(t.meerwerk, true)}</TD>
                      <TD right kleur="var(--neutral-400)">—</TD>
                      <TD right kleur="var(--neutral-400)">—</TD>
                    </tr>
                  )}
                  <tr style={{ borderTop: '1px solid var(--neutral-100)' }}>
                    <TD vet wrap>Contracttotaal</TD>
                    <TD right vet>{fmt(t.contractTotaal, true)}</TD>
                    <TD right kleur="var(--neutral-400)">—</TD>
                    <TD right kleur="var(--neutral-400)">—</TD>
                  </tr>

                  <SectieRij titel="BTW-specificatie" />
                  {/* Nog geen enkel tarief bekend: een nulregel in plaats van een kopje met niets
                      eronder, zodat de specificatie dezelfde vorm houdt als straks. */}
                  {btwGroepen.length === 0 && !btwOnvolledig && (
                    <LegeRij velden={['tekst', 'bedrag', 'bedrag', 'bedrag']} label="Nog geen BTW-tarief bekend" />
                  )}
                  {btwGroepen.map((g) => (
                    <tr key={g.pct ?? 'onbekend'}>
                      <TD wrap>{g.pct != null ? `BTW ${fmtPct(g.pct)}` : 'Tarief onbekend'}</TD>
                      <TD right>{fmt(g.grondslag, true)}</TD>
                      <TD right>{fmt(g.btw, true)}</TD>
                      <TD right>{fmt(rond(g.grondslag + g.btw), true)}</TD>
                    </tr>
                  ))}
                  {btwOnvolledig && (
                    <tr>
                      <TD wrap kleur="var(--amber-700, #b45309)">
                        Nog geen BTW-tarief bekend
                        <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>
                          {data.termijnen.length === 0 ? 'geen termijnstaat' : 'niet in de termijnstaat'}
                        </span>
                      </TD>
                      <TD right>{fmt(zonderTarief, true)}</TD>
                      <TD right kleur="var(--neutral-400)">—</TD>
                      <TD right kleur="var(--neutral-400)">—</TD>
                    </tr>
                  )}
                  <tr style={{ background: 'var(--neutral-50)' }}>
                    <TD vet wrap>Totaal</TD>
                    <TD right vet>{fmt(totaalExcl, true)}</TD>
                    <TD right vet={btwBekend} kleur={btwBekend ? undefined : 'var(--neutral-400)'}>{btwBekend ? fmt(btwTotaal, true) : '—'}</TD>
                    <TD right vet={btwBekend} accent={btwBekend} kleur={btwBekend ? undefined : 'var(--neutral-400)'}>{btwBekend ? fmt(totaalIncl, true) : '—'}</TD>
                  </tr>

                  <SectieRij titel="Facturatiestand" />
                  <tr>
                    <TD wrap>Gefactureerd</TD>
                    <TD right accent={gefactureerdExcl > 0}>{fmt(gefactureerdExcl, true)}</TD>
                    <TD right kleur={heeftFacturen ? undefined : 'var(--neutral-400)'}>{heeftFacturen ? fmt(factuurBtw, true) : '—'}</TD>
                    <TD right kleur={heeftFacturen ? undefined : 'var(--neutral-400)'}>{heeftFacturen ? fmt(factuurIncl, true) : '—'}</TD>
                  </tr>
                  <tr style={{ background: 'var(--neutral-50)' }}>
                    <TD vet wrap>Nog te factureren</TD>
                    <TD right vet>{fmt(openstaandExcl, true)}</TD>
                    <TD right kleur="var(--neutral-400)">—</TD>
                    <TD right kleur="var(--neutral-400)">—</TD>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', padding: '8px 12px', lineHeight: 1.5 }}>
                {!btwBekend
                  ? 'Er staan nog geen bedragen met een BTW-tarief in de termijnstaat, dus de BTW en het totaal incl. BTW zijn nog niet te bepalen.'
                  : btwOnvolledig
                    ? `De BTW-tarieven komen uit de termijnstaat. Over ${fmt(zonderTarief)} van het contract is nog geen tarief bekend, dus het totaal incl. BTW is een ondergrens.`
                    : `De BTW-tarieven komen uit de termijnstaat${meerwerkInTermijnstaat || goedgekeurdeRegels.length === 0 ? '' : ', aangevuld met het goedgekeurde meerwerk uit EVA'}.`}
              </div>
            </CardBody>
          </Card>
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
                      <span>
                        Termijnen dekken {fmt(dk.somBedrag)} van {fmt(termijnGrondslag)} aanneemsom
                        {' '}— nog {fmt(dk.ontbreektBedrag)}
                        {dk.ontbreektPct != null ? ` (${fmtPct(dk.ontbreektPct)})` : ''} niet in termijnen opgenomen
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
