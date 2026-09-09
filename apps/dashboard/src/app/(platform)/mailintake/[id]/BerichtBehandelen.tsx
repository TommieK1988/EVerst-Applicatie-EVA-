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
import {
  maakDossierVanBericht, koppelBerichtAanDossier, negeerBericht,
  markeerGeenAanvraag, leesOpnieuw, getBijlageUrl, heropenBericht,
} from '@/lib/mailintake/actions'
import {
  MAIL_SOORT_LABELS, HERKEND_VIA_LABELS, DUPLICAAT_HARD, DUPLICAAT_TWIJFEL,
  VELD_BETROUWBAAR,
} from '@/lib/mailintake/types'

const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const
const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const
const kop = { fontSize: 13, fontWeight: 600, marginBottom: 6 } as const

const veldStijl: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 6, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)',
}

function bytes(n: number | null): string {
  if (!n) return ''
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`
}

/** Percentage-badge achter een veld. Onder de 80% is het nakijken waard. */
function Zekerheid({ score }: { score: number | undefined }) {
  if (score == null || score === 0) return null
  const pct = Math.round(score * 100)
  const goed = score >= VELD_BETROUWBAAR
  return (
    <span
      title={goed ? 'EVA is hier zeker van' : 'Controleer dit veld'}
      style={{
        ...klein, marginLeft: 6, padding: '1px 5px', borderRadius: 4,
        background: goed ? 'var(--su-100, #dcfce7)' : 'var(--wa-100, #fef3c7)',
        color: goed ? 'var(--su-800, #166534)' : 'var(--wa-800, #92400e)',
      }}
    >
      {pct}%
    </span>
  )
}

function Veld({
  label, score, children,
}: { label: string; score?: number; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ ...klein, display: 'flex', alignItems: 'center' }}>
        {label}<Zekerheid score={score} />
      </span>
      {children}
    </label>
  )
}

type Detail = {
  bericht: any
  postbus: any
  bijlagen: any[]
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
      router.push(`/dossiers/${res.dossierId}`)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.1fr) minmax(260px, 0.9fr)', gap: 12, alignItems: 'start' }}>

        {/* ── Links: de mail ── */}
        <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={kop}>{b.onderwerp ?? '(geen onderwerp)'}</div>
            <div style={zacht}>{b.van_naam ?? ''} &lt;{b.van_adres ?? 'onbekend'}&gt;</div>
            <div style={klein}>
              {new Date(b.ontvangen_op).toLocaleString('nl-NL')} · {b.postbus?.naam}
            </div>
            {b.aan?.length ? <div style={klein}>Aan: {b.aan.join(', ')}</div> : null}
            {b.cc?.length ? <div style={klein}>Cc: {b.cc.join(', ')}</div> : null}
          </div>

          <div style={{
            whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5,
            maxHeight: 420, overflowY: 'auto', padding: 10, borderRadius: 6,
            background: 'var(--surface-2, var(--bg))', border: '1px solid var(--border)',
          }}>
            {b.body_tekst || '(lege mail)'}
          </div>

          {detail.bijlagen.length > 0 && (
            <div>
              <div style={kop}>Bijlagen</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.bijlagen.map(bij => (
                  <div key={bij.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <button
                      onClick={() => openBijlage(bij.id)}
                      disabled={!bij.opslag_pad}
                      style={{
                        background: 'none', border: 'none', padding: 0, textAlign: 'left',
                        color: bij.opslag_pad ? 'hsl(var(--primary))' : 'var(--fg-muted)',
                        cursor: bij.opslag_pad ? 'pointer' : 'default',
                        textDecoration: bij.opslag_pad ? 'underline' : 'none',
                      }}
                    >
                      {bij.bestandsnaam}
                    </button>
                    <span style={klein}>{bytes(bij.grootte_bytes)}</span>
                    {bij.te_groot && <Badge tone="warning">niet gelezen</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ── Midden: het voorstel ── */}
        <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={kop}>Voorstel</div>

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
            <Veld label="Deadline" score={zekerheid.deadline}>
              <input type="date" style={veldStijl} value={deadline ?? ''} onChange={e => setDeadline(e.target.value)} disabled={!bewerkbaar} />
            </Veld>
          </div>

          <Veld label="Opmerkingen">
            <textarea style={{ ...veldStijl, minHeight: 60 }} value={opmerkingen} onChange={e => setOpmerkingen(e.target.value)} disabled={!bewerkbaar} />
          </Veld>

          {bewerkbaar && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <Button onClick={aanmaken} disabled={!compleet || bezig}>
                {bezig ? 'Bezig…' : 'Dossier aanmaken'}
              </Button>
              <Button variant="outline" onClick={geenAanvraag} disabled={bezig}>Geen aanvraag</Button>
              <Button variant="outline" onClick={negeren} disabled={bezig}>Negeren</Button>
              <Button variant="ghost" onClick={opnieuwLezen} disabled={bezig}>Opnieuw laten lezen</Button>
            </div>
          )}
          {bewerkbaar && !compleet && (
            <span style={klein}>Vul opdrachtgever, omschrijving, werkmaatschappij, categorie en het volledige werkadres in.</span>
          )}
        </Card>

        {/* ── Rechts: waarop berust dit ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ padding: 14 }}>
            <div style={kop}>Beoordeling</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              {b.soort ? MAIL_SOORT_LABELS[b.soort as keyof typeof MAIL_SOORT_LABELS] : 'Nog niet beoordeeld'}
              {b.soort_vertrouwen != null && (
                <span style={klein}> · {Math.round(Number(b.soort_vertrouwen) * 100)}% zeker</span>
              )}
            </div>
            {b.samenvatting && <p style={zacht}>{b.samenvatting}</p>}
            {detail.extractie?.toelichting && (
              <p style={{ ...klein, marginTop: 6 }}>{detail.extractie.toelichting}</p>
            )}
          </Card>

          <Card style={{ padding: 14 }}>
            <div style={kop}>Herkenning</div>
            {b.relatie ? (
              <p style={zacht}>
                Herkend via {b.herkend_via ? HERKEND_VIA_LABELS[b.herkend_via as keyof typeof HERKEND_VIA_LABELS] : 'onbekend'} →{' '}
                <strong>{b.relatie.naam}</strong>
                {b.herkenning_score != null && <span style={klein}> ({Math.round(Number(b.herkenning_score) * 100)}%)</span>}
              </p>
            ) : (
              <p style={{ ...zacht, color: 'var(--wa-800, #92400e)' }}>
                De afzender is niet herkend als bestaande klant. Kies zelf de opdrachtgever, of maak er een nieuwe aan
                via Relaties.
              </p>
            )}
          </Card>

          <Card style={{ padding: 14 }}>
            <div style={kop}>Object</div>
            {objectTreffer?.kandidaten?.length ? (
              <>
                <p style={{ ...zacht, marginBottom: 8 }}>{objectTreffer.toelichting}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {objectTreffer.kandidaten.map(k => (
                    <label key={k.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                      <input
                        type="radio"
                        name="object"
                        checked={objectId === k.id}
                        disabled={!bewerkbaar}
                        onChange={() => setObjectId(k.id)}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        <span style={{ fontWeight: objectId === k.id ? 600 : 400 }}>{k.naam}</span>
                        <span style={klein}> · {Math.round(k.score * 100)}%</span>
                        <br />
                        <span style={klein}>{k.adres}</span>
                      </span>
                    </label>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="radio" name="object" checked={objectId === null}
                      disabled={!bewerkbaar} onChange={() => setObjectId(null)}
                    />
                    <span style={klein}>Geen object koppelen</span>
                  </label>
                </div>
              </>
            ) : (
              <p style={klein}>
                Geen object gevonden op dit adres. Het dossier wordt dan zonder objectkoppeling
                aangemaakt; dat kan later alsnog vanuit het dossier.
              </p>
            )}
          </Card>

          <Card style={{ padding: 14 }}>
            <div style={kop}>Mogelijke duplicaten</div>
            {detail.duplicaten.length === 0 ? (
              <p style={klein}>Geen vergelijkbaar dossier gevonden.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {detail.duplicaten.map(d => (
                  <div key={d.id} style={{
                    padding: 8, borderRadius: 6,
                    border: `1px solid ${d.score >= DUPLICAAT_HARD ? 'var(--da-300, #fca5a5)' : 'var(--border)'}`,
                    background: d.score >= DUPLICAAT_HARD ? 'var(--da-50, #fef2f2)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>{d.dossiernummer ?? 'dossier'}</strong>
                      <Badge tone={d.score >= DUPLICAAT_HARD ? 'error' : 'warning'}>
                        {Math.round(d.score * 100)}%
                      </Badge>
                    </div>
                    <div style={zacht}>{d.titel}</div>
                    {d.klantnaam && <div style={klein}>{d.klantnaam}</div>}
                    <ul style={{ ...klein, margin: '4px 0 0', paddingLeft: 16 }}>
                      {d.redenen.map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      <a href={`/dossiers/${d.dossierId}`} target="_blank" rel="noopener noreferrer"
                         style={{ fontSize: 12, color: 'hsl(var(--primary))' }}>
                        Bekijk dossier
                      </a>
                      {bewerkbaar && (
                        <>
                          <Button variant="ghost" onClick={() => koppelen(d.dossierId, 'gekoppeld_bestaand', 'Koppelen aan dit dossier')} disabled={bezig}>
                            Koppelen
                          </Button>
                          {d.soort === 'offerte_match' && (
                            <Button variant="ghost" onClick={() => koppelen(d.dossierId, 'offerte_gewonnen', 'Hoort bij deze offerte')} disabled={bezig}>
                              Hoort bij deze offerte
                            </Button>
                          )}
                          {d.soort === 'meerwerk_kandidaat' && (
                            <Button variant="ghost" onClick={() => koppelen(d.dossierId, 'meerwerk', 'Meerwerk op dit dossier')} disabled={bezig}>
                              Meerwerk
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
