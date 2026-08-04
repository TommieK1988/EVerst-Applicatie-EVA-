import { Suspense } from 'react'
import { getDossierVerkoop, type VerkoopTermijnStatus } from '@/lib/dossiers/actions'
import { getDossierMeerwerk } from '@/lib/dossiers/meerwerk'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, fmtPct, fmtDatum, TH, TD, LegeStaat } from './tab-ui'

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

async function VerkoopInhoud({ dossierId }: { dossierId: string }) {
  const data = await getDossierVerkoop(dossierId)
  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
  const bg = data.betaalgegevens

  if (!data.beschikbaar && !bg) {
    return (
      <LegeStaat
        titel="Geen verkoopgegevens"
        tekst="Dit dossier heeft geen Bouw7-koppeling, of er zijn nog geen termijnen, facturen of betaalgegevens."
      />
    )
  }

  // EVA-native meerwerkregels zijn leidend voor het meerwerk in het contracttotaal; valt terug op het
  // Bouw7-aggregaat uit getDossierVerkoop wanneer er nog geen goedgekeurde EVA-regels zijn.
  const meerwerk = await getDossierMeerwerk(dossierId).catch(() => null)
  const meerwerkEva = meerwerk?.totalen.goedgekeurdExcl ?? 0
  const goedgekeurdeRegels = (meerwerk?.regels ?? []).filter(r => r.status === 'akkoord' || r.status === 'voltooid')
  let t = data.totalen
  let dk = data.termijnenDekking
  if (meerwerkEva > 0 && Math.abs(meerwerkEva - t.meerwerk) > 0.005) {
    const contractTotaal = t.aanneemsom + meerwerkEva
    t = { ...t, meerwerk: meerwerkEva, contractTotaal, openstaand: Math.max(0, contractTotaal - t.gefactureerd) }
    if (dk) {
      dk = { ...dk, volledig: Math.abs(dk.somBedrag - contractTotaal) <= 1, ontbreektBedrag: Math.max(0, contractTotaal - dk.somBedrag) }
    }
  }

  /* — BTW-specificatie —
   * De termijnstaat is de enige bron met een BTW-tarief per bedrag. Meerwerk telt alleen mee zolang
   * het nog niet in de termijnstaat zit (anders zou het dubbel geteld worden); dat leiden we af uit
   * de som van de termijnen ten opzichte van het contracttotaal. */
  const termijnSom = rond(data.termijnen.reduce((s, tm) => s + tm.bedrag, 0))
  const meerwerkInTermijnstaat = t.meerwerk > 0 && termijnSom >= t.contractTotaal - 1
  const btwRijen = data.termijnen.map((tm) => ({ pct: tm.btwPercentage, excl: tm.bedrag, btw: tm.btwBedrag }))
  if (!meerwerkInTermijnstaat) {
    for (const r of goedgekeurdeRegels) {
      btwRijen.push({ pct: r.btwEffectief, excl: r.effectiefExcl, btw: rond(r.effectiefIncl - r.effectiefExcl) })
    }
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
              {t.meerwerk > 0 && (
                <tr>
                  <TD wrap>Goedgekeurd meerwerk</TD>
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

      {/* Termijnen */}
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
                  <span>Volledig gedekt — termijnen dekken de volledige aanneemsom van {fmt(t.contractTotaal)}</span>
                </>
              ) : data.termijnen.length === 0 ? (
                <>
                  <span>⚠</span>
                  <span>Geen termijnen aangemaakt voor een aanneemsom van {fmt(t.contractTotaal)}</span>
                </>
              ) : (
                <>
                  <span>⚠</span>
                  <span>
                    Termijnen dekken {fmt(dk.somBedrag)} van {fmt(t.contractTotaal)} aanneemsom
                    {' '}— nog {fmt(dk.ontbreektBedrag)}
                    {dk.ontbreektPct != null ? ` (${fmtPct(dk.ontbreektPct)})` : ''} niet in termijnen opgenomen
                  </span>
                </>
              )}
            </div>
          )}

          {!data.termijnenBeschikbaar ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Termijnen zijn niet beschikbaar voor dit project.</div>
          ) : data.termijnen.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Geen termijnen ingesteld.</div>
          ) : (
            <table style={{ ...tabel, minWidth: 860 }}>
              {/* Automatische kolombreedtes: de bedragkolommen krijgen precies de ruimte die hun
                  inhoud nodig heeft (nooit afgekapt), de omschrijving slokt de rest op en breekt af. */}
              <thead>
                <tr>
                  <TH>#</TH>
                  <TH breedte="35%">Omschrijving</TH>
                  <TH right>%</TH>
                  <TH right>Excl. BTW</TH>
                  <TH right>BTW%</TH>
                  <TH right>BTW</TH>
                  <TH right>Incl. BTW</TH>
                  <TH>Factureerbaar</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {data.termijnen.map((tm) => (
                  <tr key={tm.bouw7TermId}>
                    <TD>{tm.nummer}</TD>
                    <TD wrap>{tm.omschrijving ?? '—'}</TD>
                    <TD right>{fmtPct(tm.percentage)}</TD>
                    <TD right>{fmt(tm.bedrag)}</TD>
                    <TD right kleur="var(--neutral-500)">{fmtPct(tm.btwPercentage)}</TD>
                    <TD right>{tm.btwBedrag > 0 ? fmt(tm.btwBedrag) : '—'}</TD>
                    <TD right vet>{fmt(tm.bedragIncl)}</TD>
                    <TD>{fmtDatum(tm.invoiceableAt)}</TD>
                    <TD kleur={TERMIJN_STATUS[tm.status].kleur}>{TERMIJN_STATUS[tm.status].label}</TD>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--neutral-50)', fontWeight: 600, fontSize: 12.5 }}>
                  <td colSpan={3} style={{ padding: '6px 12px', color: 'var(--neutral-600)' }}>Totaal</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.termijnen.reduce((s, tm) => s + tm.bedrag, 0))}
                  </td>
                  <td style={{ padding: '6px 12px' }} />
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.termijnen.reduce((s, tm) => s + tm.btwBedrag, 0))}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.termijnen.reduce((s, tm) => s + tm.bedragIncl, 0))}
                  </td>
                  <td colSpan={2} style={{ padding: '6px 12px' }} />
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Meerwerk in de termijnstaat (EVA-weergave; nog niet naar Bouw7 geschreven) */}
      {goedgekeurdeRegels.length > 0 && (
        <Card>
          <CardHeader>Meerwerk in termijnstaat</CardHeader>
          <CardBody style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ ...tabel, minWidth: 620 }}>
              <thead>
                <tr>
                  <TH>#</TH>
                  <TH breedte="45%">Omschrijving</TH>
                  <TH>Verwerking</TH>
                  <TH right>Excl. BTW</TH>
                  <TH right>Incl. BTW</TH>
                </tr>
              </thead>
              <tbody>
                {goedgekeurdeRegels.map((r) => (
                  <tr key={r.id}>
                    <TD>MW{String(r.volgnummer).padStart(2, '0')}</TD>
                    <TD wrap>{r.omschrijving}</TD>
                    <TD kleur="var(--neutral-500)">
                      {r.termijn_wijze === 'eigen_termijnstaat' ? 'Eigen termijnstaat'
                        : r.termijn_wijze === 'een_regel' ? '1 regel in termijnstaat'
                        : 'Nog te kiezen'}
                    </TD>
                    <TD right vet>{fmt(r.effectiefExcl)}</TD>
                    <TD right kleur="var(--neutral-500)">{fmt(r.effectiefIncl)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', padding: '8px 12px' }}>
              EVA-weergave op basis van de meerwerkregels. Het daadwerkelijk wegschrijven van termijnen naar Bouw7 volgt in een latere fase.
            </div>
          </CardBody>
        </Card>
      )}

      {/* Verkoopfacturen */}
      <Card>
        <CardHeader>Verkoopfacturen</CardHeader>
        <CardBody style={{ padding: 0, overflowX: 'auto' }}>
          {data.facturen.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Nog geen verkoopfacturen.</div>
          ) : (
            <table style={{ ...tabel, minWidth: 640 }}>
              <thead>
                <tr>
                  <TH>Factuurnr.</TH>
                  <TH>Datum</TH>
                  <TH>Vervaldatum</TH>
                  <TH right>Excl. BTW</TH>
                  <TH right>BTW</TH>
                  <TH right>Incl. BTW</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {data.facturen.map((f, i) => (
                  <tr key={i}>
                    <TD wrap>{f.factuurnummer ?? '—'}{f.isCredit ? ' (credit)' : ''}</TD>
                    <TD>{fmtDatum(f.datum)}</TD>
                    <TD>{fmtDatum(f.vervaldatum)}</TD>
                    <TD right kleur={f.isCredit ? 'var(--neutral-500)' : undefined}>{fmt(f.bedragExcl)}</TD>
                    <TD right kleur="var(--neutral-500)">{f.btwBedrag > 0 ? fmt(f.btwBedrag) : '—'}</TD>
                    <TD right kleur={f.isCredit ? 'var(--neutral-500)' : undefined} vet>{fmt(f.bedrag)}</TD>
                    <TD kleur={f.betaald ? 'var(--accent)' : undefined}>{f.betaald ? 'Betaald' : 'Open'}</TD>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--neutral-50)', fontWeight: 600, fontSize: 12.5 }}>
                  <td colSpan={3} style={{ padding: '6px 12px', color: 'var(--neutral-600)' }}>Totaal</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.bedragExcl : f.bedragExcl), 0))}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.btwBedrag : f.btwBedrag), 0))}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.bedrag : f.bedrag), 0))}
                  </td>
                  <td style={{ padding: '6px 12px' }} />
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

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

export function VerkoopTab({ dossierId }: { dossierId: string }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 1100 }}>
      <Suspense fallback={<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SkeletonCard /><SkeletonCard /></div>}>
        <VerkoopInhoud dossierId={dossierId} />
      </Suspense>
    </div>
  )
}
