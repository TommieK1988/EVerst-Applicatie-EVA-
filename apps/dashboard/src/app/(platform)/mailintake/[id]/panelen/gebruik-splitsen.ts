'use client'

/**
 * Eén bericht, meerdere dossiers -- de toestand achter het splitspaneel.
 *
 * Een mail van een beheerder over twee panden is twee klussen. Het formulier op het
 * scherm draagt steeds één klus: de opdrachtgever en de contactpersoon blijven
 * staan, het werkadres, de omschrijving en de bijlagen wisselen per dossier. Na elk
 * dossier vult dit het volgende adres in uit wat EVA in de mail vond
 * (`overige_werkadressen`), en het bericht gaat pas op 'verwerkt' als de
 * behandelaar afrondt. Zie `lib/mailintake/splitsen.ts` voor de serverkant.
 */

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { useDialogen } from '@/components/ui'
import { rondGesplitstBerichtAf } from '@/lib/mailintake/splitsen-actions'
import { dossierSegment } from '@/lib/dossiers/href'
import { FASE_PLAATSINGEN, type DossierFase } from '@/components/dossiers/fase-plaatsing'

export interface Deel {
  dossierId: string
  dossiernummer: string | null
  werkadres: string | null
  /** Onder de sectie waar het dossier terechtkwam; zie de uitleg in het behandelscherm. */
  href: string
}

function deelHref(id: string, fase: unknown): string {
  const k = (FASE_PLAATSINGEN[fase as DossierFase] ?? FASE_PLAATSINGEN.aanvraag).kolommen
  return `/${dossierSegment(k.hoofdstatus, k.servicedesk_substatus) ?? 'aanvragen'}/${id}`
}

export interface AdresSuggestie {
  straat: string | null
  huisnummer: string | null
  postcode: string | null
  stad: string | null
  omschrijving: string | null
}

interface AdresZetters {
  straat: string
  huisnummer: string
  stad: string
  setStraat: (v: string) => void
  setHuisnummer: (v: string) => void
  setPostcode: (v: string) => void
  setStad: (v: string) => void
  controleer: () => void
  setContactNaam: (v: string) => void
  setContactTelefoon: (v: string) => void
  setContactEmail: (v: string) => void
}

/** "Kleiweg 12, Gouda" -- zo staat een deel in het besluitenlog en op het scherm. */
export function adresRegel(a: { straat?: string | null; huisnummer?: string | null; stad?: string | null }) {
  const straat = [a.straat, a.huisnummer].filter(Boolean).join(' ')
  return [straat, a.stad].filter(Boolean).join(', ')
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function useSplitsen({
  berichtId, log, velden, gekeurd, bijlagen, adres, zetOmschrijving, zetScope,
}: {
  berichtId: string
  log: { actie: string; details: Record<string, unknown> | null }[]
  velden: Record<string, unknown>
  gekeurd: Record<string, unknown> | null
  bijlagen: { id: string; bestandsnaam: string; is_inline?: boolean | null }[]
  adres: AdresZetters
  zetOmschrijving: (v: string) => void
  zetScope: (v: string) => void
}) {
  const router = useRouter()
  const { bevestig } = useDialogen()

  // De dossiers die al uit dit bericht kwamen; het log staat nieuwste eerst.
  const delen = React.useMemo<Deel[]>(() => log
    .filter(l => l.actie === 'dossier_aangemaakt' && l.details?.dossier_id)
    .map(l => ({
      dossierId: String(l.details!.dossier_id),
      dossiernummer: (l.details!.dossiernummer as string | null) ?? null,
      werkadres: (l.details!.werkadres as string | null) ?? null,
      href: deelHref(String(l.details!.dossier_id), l.details!.fase),
    }))
    .reverse(), [log])

  const meerdere = Boolean(gekeurd?.meerdereWerkadressen ?? velden.meerdere_werkadressen)
  const suggesties = React.useMemo(
    () => (Array.isArray(velden.overige_werkadressen) ? velden.overige_werkadressen : []) as AdresSuggestie[],
    [velden.overige_werkadressen],
  )

  // Standaard aan als EVA meerdere adressen zag: dan is één dossier het foute
  // antwoord, en wie toch één wil zet het met één klik uit.
  const [aan, setAan] = React.useState(meerdere || delen.length > 0)

  // Een voorgesteld adres is "gedaan" als er al een deel op dat adres staat. Niet
  // in een eigen toestand: na herladen hoort dezelfde lijst er te staan.
  const gedaan = (s: AdresSuggestie) => {
    const regel = norm(adresRegel(s))
    return Boolean(regel) && delen.some(d => d.werkadres && norm(d.werkadres) === regel)
  }
  const open = suggesties.filter(s => !gedaan(s))

  const kiesbaar = bijlagen.filter(b => !b.is_inline)
  const [bijlageIds, setBijlageIds] = React.useState<ReadonlySet<string>>(
    () => new Set(kiesbaar.map(b => b.id)),
  )
  const wisselBijlage = (id: string) => setBijlageIds(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // De adrescontrole na het overnemen draait een render later: `controleer` leest
  // de velden uit zijn sluiting, en die zijn direct na het zetten nog de oude.
  const [teControleren, setTeControleren] = React.useState(0)
  React.useEffect(() => {
    if (teControleren) adres.controleer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teControleren])

  function neemOver(s: AdresSuggestie) {
    adres.setStraat(s.straat ?? '')
    adres.setHuisnummer(s.huisnummer ?? '')
    adres.setPostcode(s.postcode ?? '')
    adres.setStad(s.stad ?? '')
    // Wie je ter plaatse belt hoort bij het vorige adres, niet bij dit.
    adres.setContactNaam(''); adres.setContactTelefoon(''); adres.setContactEmail('')
    if (s.omschrijving) { zetOmschrijving(s.omschrijving); zetScope(s.omschrijving) }
    setTeControleren(n => n + 1)
  }

  /**
   * Vóór één dossier terwijl EVA meer adressen zag: eerst vragen. Zo verdween het
   * tweede adres van Schep Vastgoed in de opmerkingen.
   */
  async function magEenDossier(): Promise<boolean> {
    if (!meerdere || aan) return true
    return bevestig({
      titel: 'Meerdere werkadressen',
      omschrijving: 'EVA vond in deze mail werk op meer dan één adres. Eén dossier krijgt maar één ' +
        'werkadres. Wil je toch één dossier, of per adres een dossier (bovenaan het voorstel)?',
      bevestigLabel: 'Toch één dossier',
      annuleerLabel: 'Terug',
    })
  }

  /** Wat er met het aanmaken mee moet; null = gewoon één dossier. */
  function deelVoorAanmaak() {
    if (!aan) return null
    return { bijlageIds: [...bijlageIds], werkadres: adresRegel(adres) }
  }

  /** Na een deel: het volgende adres klaarzetten, of de velden leegmaken. */
  function naAanmaken(gemaakt: string) {
    const volgende = open.find(s => norm(adresRegel(s)) !== norm(gemaakt))
    if (volgende) neemOver(volgende)
    else neemOver({ straat: null, huisnummer: null, postcode: null, stad: null, omschrijving: null })
    router.refresh()
  }

  const [bezig, setBezig] = React.useState(false)
  async function afronden() {
    const overgeslagen = open.map(adresRegel).filter(Boolean)
    const ok = await bevestig({
      titel: 'Bericht afhandelen',
      omschrijving:
        `Er ${delen.length === 1 ? 'is 1 dossier' : `zijn ${delen.length} dossiers`} uit dit bericht gemaakt. ` +
        'Het bericht gaat nu op verwerkt en de mail uit Postvak IN.' +
        (overgeslagen.length
          ? `\n\nDeze adressen uit de mail krijgen géén dossier:\n${overgeslagen.map(a => `- ${a}`).join('\n')}`
          : ''),
      bevestigLabel: 'Afhandelen',
      annuleerLabel: 'Nog niet',
    })
    if (!ok) return
    setBezig(true)
    try {
      const res = await rondGesplitstBerichtAf(berichtId, overgeslagen.join('; ') || null)
      if (!res.ok) { toast.error(res.error ?? 'Afhandelen mislukt'); return }
      toast.success('Bericht afgehandeld')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return {
    aan, setAan, meerdere, delen, suggesties, open, gedaan, neemOver,
    kiesbaar, bijlageIds, wisselBijlage,
    magEenDossier, deelVoorAanmaak, naAanmaken, afronden, bezig,
  }
}

export type Splitsen = ReturnType<typeof useSplitsen>
