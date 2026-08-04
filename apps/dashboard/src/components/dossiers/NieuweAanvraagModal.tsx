'use client'
import React from 'react'
import toast from 'react-hot-toast'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui'
import type { DossierRij } from './types'
import { maakAanvraag, zoekRelaties, getAanvraagCategorieen, type OpdrachtgeverZoekResultaat } from '@/lib/dossiers/actions'
import type { VastgoedObject } from '@everts/database'
import ObjectVoorinvullen from '@/components/objecten/ObjectVoorinvullen'
import { createOrganisatie } from '@/lib/relaties/actions'
import { createContactpersoon, getContactpersonenVoorOrganisatie } from '@/lib/relaties/contactpersonen-actions'
import { zoekAdres, isHuisnummerReeks, eersteHuisnummer } from '@/lib/adres/pdok'
import { uploadDossierBestandenNaarSharePoint } from '@/lib/dossiers/sharepoint-bestanden'
import { maakProjectVanAanvraag } from '@/app/(platform)/everts-calc/actions/projecten'
import { koppelDossierAanProject } from '@/lib/dossiers/actions'

export type AanvraagCategorie = { id: number; name: string }
export type AanvraagWerkmaatschappij = { id: string; naam: string; code: string | null }

type Props = {
  open: boolean
  onClose: () => void
  onAanmaken: (dossier: DossierRij) => void
  categorieen?: AanvraagCategorie[]
  werkmaatschappijen?: AanvraagWerkmaatschappij[]
}

/** Vandaag als "YYYY-MM-DD" (client-runtime). */
function vandaag(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Splitst een gecombineerd "Straat + huisnummer"-veld in straat en huisnummer.
 * Het huisnummer = vanaf het eerste losse getal (incl. toevoeging/reeks), de rest is straat.
 * Bv. "Oude Delft 169A" → { straat: "Oude Delft", huisnummer: "169A" }.
 */
function parseAdres(waarde: string): { straat: string; huisnummer: string } {
  const s = waarde.trim()
  const m = s.match(/^(.*?)[\s,]+(\d+.*)$/)
  if (m) return { straat: m[1].trim(), huisnummer: m[2].trim() }
  return { straat: s, huisnummer: '' }
}

export function NieuweAanvraagModal({ open, onClose, onAanmaken, categorieen, werkmaatschappijen = [] }: Props) {
  const [klantId,        setKlantId]        = React.useState<string | null>(null)
  const [klantNaam,      setKlantNaam]      = React.useState('')
  const [zoekQuery,      setZoekQuery]      = React.useState('')
  const [zoekResultaten, setZoekResultaten] = React.useState<OpdrachtgeverZoekResultaat[]>([])
  const [zoekOpen,       setZoekOpen]       = React.useState(false)
  const [zoekBezig,      setZoekBezig]      = React.useState(false)
  const [contactpersoonId,   setContactpersoonId]   = React.useState<string | null>(null)
  const [contactpersoonNaam, setContactpersoonNaam] = React.useState('')
  const [contactpersonenLijst, setContactpersonenLijst] = React.useState<{ id: string; naam: string; functie: string | null }[]>([])
  const [titel,          setTitel]          = React.useState('')
  const [werkmaatschappijId, setWerkmaatschappijId] = React.useState('')
  const [categorieId,    setCategorieId]    = React.useState('')   // Bouw7 category-id als string ('' = geen)
  const [referentie,     setReferentie]     = React.useState('')
  const [vveCode,        setVveCode]        = React.useState('')
  const [aanvraagdatum,  setAanvraagdatum]  = React.useState(vandaag())
  const [deadline,       setDeadline]       = React.useState('')
  const [straatHuisnr,   setStraatHuisnr]   = React.useState('')  // gecombineerd "Straat + huisnummer"
  const [postcode,       setPostcode]       = React.useState('')
  const [stad,           setStad]           = React.useState('')
  const [adresStatus,    setAdresStatus]    = React.useState<'idle' | 'zoeken' | 'gevonden' | 'niet_gevonden'>('idle')
  const [opmerkingen,    setOpmerkingen]    = React.useState('')
  const [bestanden,      setBestanden]      = React.useState<File[]>([])
  const [isLaden,        setIsLaden]        = React.useState(false)
  const [nieuweOrgOpen,  setNieuweOrgOpen]  = React.useState(false)
  const [object,         setObject]         = React.useState<VastgoedObject | null>(null)
  const [nieuweCpOpen,   setNieuweCpOpen]   = React.useState(false)
  const [catGeladen,     setCatGeladen]     = React.useState<AanvraagCategorie[]>(categorieen ?? [])

  const zoekTimerRef      = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const adresTimerRef     = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoekContainerRef  = React.useRef<HTMLDivElement>(null)
  const fileInputRef      = React.useRef<HTMLInputElement>(null)

  function reset() {
    setKlantId(null); setKlantNaam(''); setZoekQuery(''); setZoekResultaten([]); setZoekOpen(false)
    setContactpersoonId(null); setContactpersoonNaam(''); setContactpersonenLijst([])
    setTitel(''); setWerkmaatschappijId(''); setCategorieId(''); setReferentie(''); setVveCode('')
    setAanvraagdatum(vandaag()); setDeadline('')
    setStraatHuisnr(''); setPostcode(''); setStad(''); setAdresStatus('idle')
    setOpmerkingen(''); setBestanden([])
  }

  function handleClose() { reset(); onClose() }

  // Categorieën uit Bouw7 laden zodra de modal opent (alleen als niet meegegeven via props).
  React.useEffect(() => {
    if (!open) return
    if ((categorieen?.length ?? 0) > 0) { setCatGeladen(categorieen!); return }
    let actief = true
    getAanvraagCategorieen().then(cats => { if (actief) setCatGeladen(cats) }).catch(() => {})
    return () => { actief = false }
  }, [open, categorieen])

  // Contactpersonen van de gekozen opdrachtgever laden voor het keuzeveld.
  React.useEffect(() => {
    if (!klantId) { setContactpersonenLijst([]); return }
    let actief = true
    getContactpersonenVoorOrganisatie(klantId).then(rows => {
      if (!actief) return
      setContactpersonenLijst(rows.map((r: any) => ({
        id: r.contactpersoon.id,
        naam: [r.contactpersoon.voornaam, r.contactpersoon.tussenvoegsel, r.contactpersoon.achternaam].filter(Boolean).join(' '),
        functie: r.functie ?? null,
      })))
    }).catch(() => {})
    return () => { actief = false }
  }, [klantId])

  // Sluit dropdown bij klik buiten
  React.useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (zoekContainerRef.current && !zoekContainerRef.current.contains(e.target as Node)) {
        setZoekOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function handleZoekInput(value: string) {
    setZoekQuery(value)
    setKlantId(null)            // selectie vervalt bij typen
    setKlantNaam(value)
    setContactpersoonId(null); setContactpersoonNaam('')
    if (zoekTimerRef.current) clearTimeout(zoekTimerRef.current)
    if (!value.trim()) { setZoekResultaten([]); setZoekOpen(false); return }
    setZoekBezig(true)
    zoekTimerRef.current = setTimeout(async () => {
      try {
        const resultaten = await zoekRelaties(value)
        setZoekResultaten(resultaten)
        setZoekOpen(true)
      } finally {
        setZoekBezig(false)
      }
    }, 280)
  }

  /**
   * Object gekozen: vul de velden die het object kent.
   *
   * Alleen lege velden worden gevuld — wat iemand al heeft ingetypt is bewuster dan wat
   * het object standaard aanbiedt. Werkmaatschappij en categorie blijven er buiten: die
   * hangen aan de opdracht, niet aan het pand.
   */
  function kiesObject(o: VastgoedObject, opdrachtgeverNaam: string | null) {
    setObject(o)

    const adres = [o.adres_straat, o.adres_huisnummer].filter(Boolean).join(' ').trim()
    if (adres && !straatHuisnr.trim()) setStraatHuisnr(adres)
    if (o.adres_postcode && !postcode.trim()) setPostcode(o.adres_postcode)
    if (o.adres_plaats && !stad.trim()) setStad(o.adres_plaats)
    if (o.vve_code && !vveCode.trim()) setVveCode(o.vve_code)

    if (o.standaard_opdrachtgever_id && !klantId) {
      setKlantId(o.standaard_opdrachtgever_id)
      if (opdrachtgeverNaam) { setKlantNaam(opdrachtgeverNaam); setZoekQuery(opdrachtgeverNaam) }
    }
  }

  function selecteerRelatie(rel: OpdrachtgeverZoekResultaat) {
    setKlantId(rel.id)
    setKlantNaam(rel.naam)
    setZoekQuery(rel.naam)
    setZoekOpen(false)
    setZoekResultaten([])
    if (rel.contactpersoon) {
      setContactpersoonId(rel.contactpersoon.id)
      setContactpersoonNaam(rel.contactpersoon.naam)
    } else {
      setContactpersoonId(null); setContactpersoonNaam('')
    }
  }

  // ── Werkadres-controle via PDOK ─────────────────────────────────────
  // Richting 1: postcode + huisnummer → straat + plaats aanvullen.
  React.useEffect(() => {
    if (adresTimerRef.current) clearTimeout(adresTimerRef.current)
    const pc = postcode.trim()
    const { straat: pStraat, huisnummer: hn } = parseAdres(straatHuisnr)
    if (!pc || !hn) { setAdresStatus('idle'); return }
    setAdresStatus('zoeken')
    adresTimerRef.current = setTimeout(async () => {
      const res = await zoekAdres({ postcode: pc, huisnummer: hn })
      if (res.length > 0) {
        const num = eersteHuisnummer(hn)
        const exact = res.find(a => eersteHuisnummer(a.huisnummer) === num)
        const gekozen = exact ?? res[0]
        // Straat aanvullen als die nog ontbreekt (bv. bij enkel een huisnummer); niet overschrijven wat de gebruiker typt.
        if (!pStraat && gekozen.straat) setStraatHuisnr(`${gekozen.straat} ${gekozen.huisnummer || hn}`.trim())
        setStad(gekozen.stad)
        if (gekozen.postcode) setPostcode(gekozen.postcode)
        setAdresStatus(exact || isHuisnummerReeks(hn) ? 'gevonden' : 'niet_gevonden')
      } else {
        setAdresStatus('niet_gevonden')
      }
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode, straatHuisnr])

  // Richting 2: straat + huisnummer → postcode (+ plaats) aanvullen. Alleen zolang de postcode
  // nog leeg is, zodat de twee richtingen elkaar niet tegenwerken.
  React.useEffect(() => {
    if (postcode.trim()) return
    const { straat: st, huisnummer: hn } = parseAdres(straatHuisnr)
    if (!st || !hn) return
    setAdresStatus('zoeken')
    const timer = setTimeout(async () => {
      const res = await zoekAdres({ straat: st, huisnummer: hn, stad: stad.trim() || undefined })
      const num = eersteHuisnummer(hn)
      const gekozen = res.find(a => eersteHuisnummer(a.huisnummer) === num) ?? res[0]
      if (gekozen?.postcode) {
        setPostcode(gekozen.postcode)
        if (!stad.trim() && gekozen.stad) setStad(gekozen.stad)
        setAdresStatus('gevonden')
      } else {
        setAdresStatus('idle')
      }
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [straatHuisnr, stad, postcode])

  function handleFiles(files: FileList | null) {
    if (!files) return
    setBestanden(p => [...p, ...Array.from(files)])
  }

  async function handleNieuweOrg(naam: string) {
    const res = await createOrganisatie({ naam: naam.trim(), types: ['opdrachtgever'] })
    if (!res.ok) { toast.error(res.error); return }
    setKlantId(res.id); setKlantNaam(naam.trim()); setZoekQuery(naam.trim())
    setContactpersoonId(null); setContactpersoonNaam('')
    setNieuweOrgOpen(false)
    toast.success('Opdrachtgever aangemaakt')
  }

  async function handleNieuweCp(voornaam: string, achternaam: string, functie: string) {
    if (!klantId) { toast.error('Kies eerst een opdrachtgever.'); return }
    const res = await createContactpersoon({ voornaam: voornaam.trim(), achternaam: achternaam.trim(), functie: functie.trim() || null, organisatie_id: klantId })
    if (!res.ok) { toast.error(res.error); return }
    const naam = [voornaam.trim(), achternaam.trim()].filter(Boolean).join(' ')
    setContactpersonenLijst(prev => [{ id: res.id, naam, functie: functie.trim() || null }, ...prev.filter(c => c.id !== res.id)])
    setContactpersoonId(res.id)
    setContactpersoonNaam(naam)
    setNieuweCpOpen(false)
    toast.success('Contactpersoon aangemaakt')
  }

  async function handleAanmaken() {
    if (!geldig) return
    setIsLaden(true)
    try {
      const cat = catOpties.find(c => String(c.id) === categorieId)
      const result = await maakAanvraag({
        titel: projectnaam,
        klant_id: klantId,
        contactpersoon_id: contactpersoonId,
        categorie: cat?.name ?? null,
        bouw7_categorie_id: cat?.id ?? null,
        referentie: referentie.trim() || null,
        werkmaatschappij_id: werkmaatschappijId,
        vve_code: vveCode.trim() || null,
        aanvraagdatum: aanvraagdatum || null,
        deadline: deadline || null,
        opmerkingen: opmerkingen.trim() || null,
        werkadres_straat: parsedAdres.straat || null,
        werkadres_huisnummer: parsedAdres.huisnummer || null,
        werkadres_postcode: postcode.trim() || null,
        werkadres_stad: stad.trim() || null,
        object_id: object?.id ?? null,
      })
      if (!result.ok) { toast.error(result.error); return }

      const dossier = result.data
      try {
        const { id: projectId } = await maakProjectVanAanvraag(projectnaam, klantNaam)
        await koppelDossierAanProject(dossier.id, projectId)
      } catch {
        // Koppeling kan later via de calculatie-tab worden aangemaakt
      }

      if (result.bouw7.ok) {
        toast.success(result.bouw7.dossiernummer ? `Aangemaakt in Bouw7 — ${result.bouw7.dossiernummer}` : 'Aangemaakt in Bouw7')
      } else {
        toast.error(`Aanvraag opgeslagen in EVA, maar niet naar Bouw7: ${result.bouw7.error ?? 'onbekende fout'}`)
      }

      // Meegestuurde bestanden naar de SharePoint-dossiermap (best-effort, niet blokkerend).
      if (bestanden.length > 0) {
        try {
          const fd = new FormData()
          bestanden.forEach(f => fd.append('bestanden', f))
          const up = await uploadDossierBestandenNaarSharePoint(dossier.id, fd)
          if (up.ok && up.geuploaded > 0) toast.success(`${up.geuploaded} bestand(en) naar SharePoint`)
          else if (up.fout) toast.error(`Bestanden: ${up.fout}`)
        } catch {
          toast.error('Uploaden van bestanden naar SharePoint mislukt.')
        }
      }

      onAanmaken({ ...dossier, klant_naam: klantNaam, projectleider_naam: null })
      reset()
      onClose()
    } finally {
      setIsLaden(false)
    }
  }

  const catOpties = catGeladen
  // Projectnaam wordt automatisch opgebouwd: "Adres, Plaats - Omschrijving".
  const parsedAdres  = parseAdres(straatHuisnr)
  const adresPlaats  = [straatHuisnr.trim(), stad.trim()].filter(Boolean).join(', ')
  const projectnaam  = (adresPlaats ? `${adresPlaats} - ${titel.trim()}` : titel.trim()).trim()
  const adresCompleet = Boolean(postcode.trim() && parsedAdres.straat && parsedAdres.huisnummer && stad.trim())
  const geldig = Boolean(klantId && titel.trim() && werkmaatschappijId && categorieId && adresCompleet)

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) handleClose() }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Nieuwe aanvraag</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <Groep titel="Object">
            <ObjectVoorinvullen
              gekozen={object}
              onKies={kiesObject}
              onWis={() => setObject(null)}
            />
          </Groep>

          <Groep titel="Basisgegevens">
            <Rij>
              {/* Opdrachtgever combobox */}
              <div ref={zoekContainerRef} style={{ position: 'relative' }}>
                <div style={labelStijl}>Opdrachtgever *</div>
                <input
                  type="text"
                  value={zoekQuery}
                  onChange={e => handleZoekInput(e.target.value)}
                  onFocus={() => zoekResultaten.length > 0 && setZoekOpen(true)}
                  placeholder="Zoek op bedrijf of contactpersoon..."
                  style={{
                    ...inputStijl, marginTop: 4,
                    border: klantId ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  }}
                />
                {zoekBezig && (
                  <div style={{ position: 'absolute', right: 10, top: 34, fontSize: 11, color: 'var(--fg-muted)' }}>…</div>
                )}
                {zoekOpen && zoekResultaten.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--bg-elev)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
                    overflow: 'hidden', marginTop: 2,
                  }}>
                    {zoekResultaten.map(rel => (
                      <button
                        key={rel.id + (rel.contactpersoon?.id ?? '')}
                        onMouseDown={e => { e.preventDefault(); selecteerRelatie(rel) }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '9px 12px', border: 'none',
                          background: 'var(--bg-elev)', cursor: 'pointer', textAlign: 'left',
                          color: 'var(--fg)', fontSize: 13,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
                      >
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 500 }}>{rel.naam}</span>
                          {rel.contactpersoon && (
                            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{rel.contactpersoon.naam}</span>
                          )}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'var(--fg-muted)', padding: '2px 6px',
                          background: 'var(--bg-active)', borderRadius: 4,
                        }}>{rel.types?.[0] ?? ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => setNieuweOrgOpen(true)} style={linkKnopStijl}>+ Nieuwe opdrachtgever</button>
                </div>
              </div>

              <Input label="Omschrijving *" waarde={titel} onChange={setTitel} placeholder="bijv. Schilderwerk buitenzijde" />
            </Rij>
            <Rij>
              {/* Contactpersoon-keuze binnen de gekozen opdrachtgever */}
              <div>
                <div style={labelStijl}>Contactpersoon</div>
                <select
                  value={contactpersoonId ?? ''}
                  disabled={!klantId}
                  onChange={e => {
                    const id = e.target.value || null
                    setContactpersoonId(id)
                    setContactpersoonNaam(contactpersonenLijst.find(c => c.id === id)?.naam ?? '')
                  }}
                  style={{ ...inputStijl, marginTop: 4, opacity: klantId ? 1 : 0.6 }}
                >
                  <option value="">{klantId ? '— Selecteer —' : 'Kies eerst een opdrachtgever'}</option>
                  {contactpersonenLijst.map(c => (
                    <option key={c.id} value={c.id}>{c.naam}{c.functie ? ` — ${c.functie}` : ''}</option>
                  ))}
                </select>
                <div style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => klantId ? setNieuweCpOpen(true) : toast.error('Kies eerst een opdrachtgever.')} style={{ ...linkKnopStijl, opacity: klantId ? 1 : 0.5 }}>+ Nieuwe contactpersoon</button>
                </div>
              </div>
              <Input
                label="Werkmaatschappij *" waarde={werkmaatschappijId} onChange={setWerkmaatschappijId} type="select"
                opties={[{ value: '', label: '— Selecteer —' }, ...werkmaatschappijen.map(w => ({ value: w.id, label: w.naam }))]}
              />
            </Rij>
            <Rij>
              <Input
                label="Categorie *" waarde={categorieId} onChange={setCategorieId} type="select"
                opties={[{ value: '', label: '— Selecteer —' }, ...catOpties.map(c => ({ value: String(c.id), label: c.name }))]}
              />
              <Input label="Referentie" waarde={referentie} onChange={setReferentie} placeholder="Klantreferentie" />
            </Rij>
            <Rij>
              <Input label="Aanvraagdatum" waarde={aanvraagdatum} onChange={setAanvraagdatum} type="date" />
              <Input label="Deadline" waarde={deadline} onChange={setDeadline} type="date" />
            </Rij>
            <Rij>
              <Input label="VvE-code" waarde={vveCode} onChange={setVveCode} placeholder="Bijv. VVE-1234" />
            </Rij>
          </Groep>

          <Groep titel="Werkadres">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 10 }}>
              <div>
                <div style={labelStijl}>Straat + huisnummer *</div>
                <input type="text" value={straatHuisnr} onChange={e => setStraatHuisnr(e.target.value)} placeholder="bijv. Oude Delft 169A" style={{ ...inputStijl, marginTop: 4 }} />
                {adresStatus === 'zoeken' && <div style={adresHintStijl('var(--fg-muted)')}>Adres controleren…</div>}
                {adresStatus === 'gevonden' && <div style={adresHintStijl('var(--succes, #16a34a)')}>✓ Adres gevonden{isHuisnummerReeks(parsedAdres.huisnummer) ? ' (gebouw met meerdere huisnummers)' : ''}</div>}
                {adresStatus === 'niet_gevonden' && <div style={adresHintStijl('var(--waarschuwing, #d97706)')}>⚠ Adres niet gevonden — controleer de gegevens</div>}
              </div>
              <Input label="Postcode *" waarde={postcode} onChange={setPostcode} placeholder="1234 AB" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              <Input label="Stad *" waarde={stad} onChange={setStad} placeholder="Plaatsnaam" />
            </div>
            <div style={{
              marginTop: 12, padding: '9px 12px', borderRadius: 8,
              background: 'var(--bg-active)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--fg)',
            }}>
              <span style={{ color: 'var(--fg-muted)' }}>Projectnaam (automatisch): </span>
              <span style={{ fontWeight: 600 }}>{projectnaam || '—'}</span>
            </div>
          </Groep>

          <Groep titel="Opmerkingen">
            <textarea
              value={opmerkingen}
              onChange={e => setOpmerkingen(e.target.value)}
              placeholder="Aanvullende informatie, wensen, bijzonderheden..."
              rows={3}
              style={{ ...inputStijl, resize: 'vertical', padding: '8px 11px' }}
            />
          </Groep>

          <Groep titel="Meegestuurde bestanden" laatste>
            <div
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)' }}
              onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
              onDrop={e => {
                e.preventDefault()
                ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
                handleFiles(e.dataTransfer.files)
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)', borderRadius: 10, padding: '18px 16px',
                textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
                background: 'var(--bg)',
              }}
            >
              <div style={{ fontSize: 20, opacity: 0.4, marginBottom: 5 }}>📎</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
                Klik of sleep bestanden hierheen
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                PDF, Word, afbeeldingen — worden opgeslagen in de SharePoint-dossiermap
              </div>
              <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleFiles(e.target.files)} />
            </div>

            {bestanden.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bestanden.map((b, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 12px', background: 'var(--bg)',
                    border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7l-3-5z"/>
                        <path d="M13 2v5h5"/>
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{b.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{fmtSize(b.size)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setBestanden(p => p.filter((_, j) => j !== i))}
                    >×</Button>
                  </div>
                ))}
              </div>
            )}
          </Groep>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Annuleer
          </Button>
          <Button
            variant="primary"
            onClick={handleAanmaken}
            disabled={!geldig}
            loading={isLaden}
          >
            {isLaden ? 'Bezig…' : 'Aanvraag aanmaken'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {nieuweOrgOpen && <NieuweOrgDialog onSluit={() => setNieuweOrgOpen(false)} onAanmaken={handleNieuweOrg} startNaam={zoekQuery} />}
      {nieuweCpOpen && <NieuweCpDialog onSluit={() => setNieuweCpOpen(false)} onAanmaken={handleNieuweCp} orgNaam={klantNaam} />}
    </Dialog>
  )
}

/* ─── Genestelde mini-dialogs (direct in Bouw7 + EVA) ────────────────── */
function NieuweOrgDialog({ onSluit, onAanmaken, startNaam }: { onSluit: () => void; onAanmaken: (naam: string) => Promise<void>; startNaam?: string }) {
  const [naam, setNaam] = React.useState(startNaam ?? '')
  const [bezig, setBezig] = React.useState(false)
  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Nieuwe opdrachtgever</DialogTitle></DialogHeader>
        <DialogBody>
          <div style={labelStijl}>Bedrijfsnaam *</div>
          <input autoFocus type="text" value={naam} onChange={e => setNaam(e.target.value)} placeholder="Bedrijfsnaam" style={{ ...inputStijl, marginTop: 4 }} />
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 8 }}>Wordt direct in Bouw7 én EVA aangemaakt als opdrachtgever.</div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleer</Button>
          <Button variant="primary" disabled={!naam.trim() || bezig} loading={bezig} onClick={async () => { setBezig(true); try { await onAanmaken(naam) } finally { setBezig(false) } }}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NieuweCpDialog({ onSluit, onAanmaken, orgNaam }: { onSluit: () => void; onAanmaken: (voornaam: string, achternaam: string, functie: string) => Promise<void>; orgNaam?: string }) {
  const [voornaam, setVoornaam] = React.useState('')
  const [achternaam, setAchternaam] = React.useState('')
  const [functie, setFunctie] = React.useState('')
  const [bezig, setBezig] = React.useState(false)
  const geldig = Boolean(voornaam.trim() && achternaam.trim())
  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Nieuwe contactpersoon</DialogTitle></DialogHeader>
        <DialogBody>
          {orgNaam && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>Bij: <strong>{orgNaam}</strong></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStijl}>Voornaam *</div>
              <input autoFocus type="text" value={voornaam} onChange={e => setVoornaam(e.target.value)} style={{ ...inputStijl, marginTop: 4 }} />
            </div>
            <div>
              <div style={labelStijl}>Achternaam *</div>
              <input type="text" value={achternaam} onChange={e => setAchternaam(e.target.value)} style={{ ...inputStijl, marginTop: 4 }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={labelStijl}>Functie</div>
            <input type="text" value={functie} onChange={e => setFunctie(e.target.value)} placeholder="Bijv. Technisch beheerder" style={{ ...inputStijl, marginTop: 4 }} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleer</Button>
          <Button variant="primary" disabled={!geldig || bezig} loading={bezig} onClick={async () => { setBezig(true); try { await onAanmaken(voornaam, achternaam, functie) } finally { setBezig(false) } }}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── helpers ────────────────────────────────────────────────────── */
const labelStijl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
}
const inputStijl: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--bg)', border: '1px solid var(--border)',
  color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none',
}
const linkKnopStijl: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-ui)',
}
function adresHintStijl(kleur: string): React.CSSProperties {
  return { marginTop: 4, fontSize: 11, fontWeight: 500, color: kleur }
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Groep({ titel, laatste, children }: { titel: string; laatste?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: laatste ? 0 : 22 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        {titel}
      </div>
      {children}
    </div>
  )
}

function Rij({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 10 }}>
      {children}
    </div>
  )
}

type Optie = { value: string; label: string }
function Input({
  label, waarde, onChange, placeholder, type = 'text', opties, vol,
}: {
  label: string
  waarde: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  opties?: Optie[]
  vol?: boolean
}) {
  const stijl: React.CSSProperties = { ...inputStijl, marginTop: 4 }
  return (
    <div style={{ gridColumn: vol ? '1 / -1' : undefined }}>
      <div style={labelStijl}>{label}</div>
      {type === 'select' && opties ? (
        <select value={waarde} onChange={e => onChange(e.target.value)} style={stijl}>
          {opties.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={waarde} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={stijl} />
      )}
    </div>
  )
}
