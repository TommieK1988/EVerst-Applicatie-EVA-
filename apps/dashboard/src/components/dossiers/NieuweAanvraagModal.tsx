'use client'
import React from 'react'
import toast from 'react-hot-toast'
import { Building2, Check, ClipboardList, FileText, Loader2, MapPin, MessageSquare, Paperclip, Search, Tag, Upload } from 'lucide-react'
import { cn } from '@everts/ui'
import {
  Button, Input, Textarea, FormField,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import { Sectie, Rij, LinkKnop, Zoeklijst, ZoeklijstItem, selectKlasse, NieuweOrgDialog, NieuweCpDialog } from './NieuweAanvraagOnderdelen'
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
  const [slepen,         setSlepen]         = React.useState(false)
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

      // De dossiermap. Lukte het niet, dan is dat geen blokkade: de nachtelijke naloop
      // probeert het opnieuw. Wel melden, want iemand die meteen bestanden kwijt wil
      // moet weten dat de map er nog niet staat.
      if (result.map) {
        if (result.map.status === 'aangemaakt') {
          const erbij = result.map.geplaatst
            ? ` met ${result.map.geplaatst} standaardbestand${result.map.geplaatst === 1 ? '' : 'en'}`
            : ''
          toast.success(`SharePoint-map aangemaakt${erbij}`)
        }
        if (result.map.fout) toast.error(`Dossiermap: ${result.map.fout}`)
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
          <div>
            <DialogTitle>Nieuwe aanvraag</DialogTitle>
            <DialogDescription>Wordt direct als project in Bouw7 aangemaakt, met een dossiermap in SharePoint.</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="bg-neutral-50">
          <Sectie titel="Object" omschrijving="Optioneel — vult werkadres, opdrachtgever en VvE-code voor je in" icoon={Building2}>
            <ObjectVoorinvullen
              gekozen={object}
              onKies={kiesObject}
              onWis={() => setObject(null)}
            />
          </Sectie>

          <Sectie titel="Basisgegevens" omschrijving="Voor wie, wat en wanneer" icoon={ClipboardList}>
            <Rij>
              {/* Opdrachtgever combobox */}
              <div ref={zoekContainerRef} className="relative flex flex-col">
                <FormField label="Opdrachtgever" upper required>
                  <Input
                    value={zoekQuery}
                    onChange={e => handleZoekInput(e.target.value)}
                    onFocus={() => zoekResultaten.length > 0 && setZoekOpen(true)}
                    placeholder="Zoek op bedrijf of contactpersoon..."
                    prefix={<Search className="h-4 w-4" />}
                    suffix={zoekBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : klantId ? <Check className="h-4 w-4 text-brand-600" /> : undefined}
                    className={klantId ? 'border-brand-500 bg-brand-50/40' : undefined}
                  />
                </FormField>
                {zoekOpen && zoekResultaten.length > 0 && (
                  <Zoeklijst>
                    {zoekResultaten.map(rel => (
                      <ZoeklijstItem
                        key={rel.id + (rel.contactpersoon?.id ?? '')}
                        titel={rel.naam}
                        regels={[rel.contactpersoon?.naam, rel.viaFactuuradres ? `factuuradres: ${rel.viaFactuuradres}` : null]}
                        badge={rel.types?.[0]}
                        onKies={() => selecteerRelatie(rel)}
                      />
                    ))}
                  </Zoeklijst>
                )}
                <LinkKnop onClick={() => setNieuweOrgOpen(true)}>+ Nieuwe opdrachtgever</LinkKnop>
              </div>

              <FormField label="Omschrijving" upper required>
                <Input value={titel} onChange={e => setTitel(e.target.value)} placeholder="bijv. Schilderwerk buitenzijde" />
              </FormField>
            </Rij>
            <Rij>
              {/* Contactpersoon-keuze binnen de gekozen opdrachtgever */}
              <div className="flex flex-col">
                <FormField label="Contactpersoon" upper>
                  <select
                    value={contactpersoonId ?? ''}
                    disabled={!klantId}
                    onChange={e => {
                      const id = e.target.value || null
                      setContactpersoonId(id)
                      setContactpersoonNaam(contactpersonenLijst.find(c => c.id === id)?.naam ?? '')
                    }}
                    className={selectKlasse}
                  >
                    <option value="">{klantId ? '— Selecteer —' : 'Kies eerst een opdrachtgever'}</option>
                    {contactpersonenLijst.map(c => (
                      <option key={c.id} value={c.id}>{c.naam}{c.functie ? ` — ${c.functie}` : ''}</option>
                    ))}
                  </select>
                </FormField>
                <LinkKnop gedimd={!klantId} onClick={() => klantId ? setNieuweCpOpen(true) : toast.error('Kies eerst een opdrachtgever.')}>
                  + Nieuwe contactpersoon
                </LinkKnop>
              </div>
              <FormField label="Werkmaatschappij" upper required>
                <select value={werkmaatschappijId} onChange={e => setWerkmaatschappijId(e.target.value)} className={selectKlasse}>
                  <option value="">— Selecteer —</option>
                  {werkmaatschappijen.map(w => <option key={w.id} value={w.id}>{w.naam}</option>)}
                </select>
              </FormField>
            </Rij>
            <Rij>
              <FormField label="Categorie" upper required>
                <select value={categorieId} onChange={e => setCategorieId(e.target.value)} className={selectKlasse}>
                  <option value="">— Selecteer —</option>
                  {catOpties.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Referentie" upper>
                <Input value={referentie} onChange={e => setReferentie(e.target.value)} placeholder="Klantreferentie" />
              </FormField>
            </Rij>
            <Rij>
              <FormField label="Aanvraagdatum" upper>
                <Input type="date" value={aanvraagdatum} onChange={e => setAanvraagdatum(e.target.value)} />
              </FormField>
              <FormField label="Deadline" upper>
                <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
              </FormField>
            </Rij>
            <Rij>
              <FormField label="VvE-code" upper>
                <Input value={vveCode} onChange={e => setVveCode(e.target.value)} placeholder="Bijv. VVE-1234" />
              </FormField>
            </Rij>
          </Sectie>

          <Sectie titel="Werkadres" omschrijving="Postcode en huisnummer worden gecontroleerd en aangevuld" icoon={MapPin}>
            <Rij>
              <FormField
                label="Straat + huisnummer" upper required
                helper={adresStatus === 'zoeken' ? 'Adres controleren…' : undefined}
                success={adresStatus === 'gevonden' ? `Adres gevonden${isHuisnummerReeks(parsedAdres.huisnummer) ? ' (gebouw met meerdere huisnummers)' : ''}` : undefined}
                error={adresStatus === 'niet_gevonden' ? 'Adres niet gevonden — controleer de gegevens' : undefined}
              >
                <Input value={straatHuisnr} onChange={e => setStraatHuisnr(e.target.value)} placeholder="bijv. Oude Delft 169A" />
              </FormField>
              <FormField label="Postcode" upper required>
                <Input value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="1234 AB" />
              </FormField>
            </Rij>
            <Rij>
              <FormField label="Stad" upper required>
                <Input value={stad} onChange={e => setStad(e.target.value)} placeholder="Plaatsnaam" />
              </FormField>
            </Rij>
            <div className="flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2.5">
              <Tag className="h-4 w-4 shrink-0 text-brand-700" />
              <div className="min-w-0 text-[13px]">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-700">Projectnaam (automatisch)</span>
                <div className={cn('truncate font-semibold', projectnaam ? 'text-neutral-900' : 'text-neutral-400')}>{projectnaam || '—'}</div>
              </div>
            </div>
          </Sectie>

          <Sectie titel="Opmerkingen" icoon={MessageSquare}>
            <Textarea
              value={opmerkingen}
              onChange={e => setOpmerkingen(e.target.value)}
              placeholder="Aanvullende informatie, wensen, bijzonderheden..."
              rows={3}
            />
          </Sectie>

          <Sectie titel="Meegestuurde bestanden" omschrijving="Worden opgeslagen in de SharePoint-dossiermap" icoon={Paperclip}>
            <div
              onDragOver={e => { e.preventDefault(); setSlepen(true) }}
              onDragLeave={() => setSlepen(false)}
              onDrop={e => { e.preventDefault(); setSlepen(false); handleFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                slepen ? 'border-brand-500 bg-brand-50' : 'border-neutral-300 bg-neutral-50 hover:border-brand-300 hover:bg-brand-50/50',
              )}
            >
              <span className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Upload className="h-4 w-4" />
              </span>
              <div className="text-[13px] font-semibold text-neutral-900">Klik of sleep bestanden hierheen</div>
              <div className="mt-0.5 text-xs text-neutral-500">PDF, Word, afbeeldingen</div>
              <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleFiles(e.target.files)} />
            </div>

            {bestanden.length > 0 && (
              <div className="flex flex-col gap-2">
                {bestanden.map((b, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-brand-700" />
                      <span className="truncate text-xs font-semibold text-neutral-900">{b.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">{fmtSize(b.size)}</span>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setBestanden(p => p.filter((_, j) => j !== i))}>×</Button>
                  </div>
                ))}
              </div>
            )}
          </Sectie>
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

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
