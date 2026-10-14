'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Boxes, BookmarkPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Meetregel, Groep, MeetstaatElement } from '@/lib/everts-calc/types'
import {
  getMeetregels, slaMeetregelOp, verwijderMeetregel,
  getMeetstaatElementen,
} from '@/lib/everts-calc/local-store'
import { nieuweId } from '@/lib/everts-calc/utils'
import {
  isRegelActief, aggregaatSleutel, herberekeningAggregaat,
  normaliseerBestekcode,
} from '@/lib/everts-calc/meetstaat-utils'
import { ontbrekendeMaat } from '@/lib/everts-calc/maat-rekenen'
import { Button } from '@/components/ui/button'
import MeetregelRij, { LAATSTE_KOL } from './MeetregelRij'
import NaarCalculatieTabel from './NaarCalculatieTabel'
import ElementOpslaanDialog from './ElementOpslaanDialog'
import ElementKiezerDialog from './ElementKiezerDialog'

interface SchilderData {
  onderdelen: { id: string; naam: string; code: string | null }[]
  types: { id: string; onderdeel_id: string; naam: string; eenheid: string; formule: string | null; code: string | null }[]
  behandelingen: { id: string; naam: string; code: string | null }[]
  combinaties: { id: string; onderdeel_id: string; type_id: string; behandeling_id: string }[]
}

interface Props {
  meetstaatId: string
  groepId: string
  groepen: Groep[]
  onWijziging?: () => void
  schilderData?: SchilderData
}

function nieuweLegeRegel(meetstaatId: string, groepId: string, volgorde: number): Meetregel {
  return {
    id: nieuweId(),
    meetstaat_id: meetstaatId,
    groep_id: groepId,
    volgorde,
    aantal: 1,
    eenheid: 'm²',
    is_leeg: true,
    aangepast_op: new Date().toISOString(),
  }
}

/**
 * Mag links/rechts de cel verlaten, of hoort de toets bij de cursor in het veld?
 * Getalvelden verspringen altijd: hun inhoud is kort, en de cursorpositie is er
 * niet uit te lezen — Chrome gooit een fout op selectionStart bij type="number".
 */
function magCelVerlaten(el: HTMLInputElement, richting: 'links' | 'rechts'): boolean {
  try {
    const start = el.selectionStart
    const eind = el.selectionEnd
    if (start === null || eind === null) return true
    return richting === 'links'
      ? start === 0 && eind === 0
      : start === el.value.length && eind === el.value.length
  } catch {
    return true
  }
}

export default function MeetregelGrid({ meetstaatId, groepId, groepen, onWijziging, schilderData }: Props) {
  const [regels, setRegels] = useState<Meetregel[]>([])
  const [actieveId, setActieveId] = useState<string | null>(null)
  // Welke rij de cursor moet krijgen. Bewust los van `actieveId`: dat verspringt bij
  // élke klik en elke pijltoets, en een rij die daarop de focus pakt trekt je uit de
  // cel die je net koos.
  const [focusRijId, setFocusRijId] = useState<string | null>(null)
  const [geselecteerd, setGeselecteerd] = useState<Set<string>>(new Set())
  const [opslaanOpen, setOpslaanOpen] = useState(false)
  const [kiezerOpen, setKiezerOpen] = useState(false)
  const [elementTeller, setElementTeller] = useState(0)
  const bladRef = useRef<HTMLDivElement>(null)
  const groep = groepen.find(g => g.id === groepId)
  // Codes die al ergens in deze meetstaat staan; de code-cel stelt ze voor, zodat
  // dezelfde bestekscode ook op dezelfde manier geschreven wordt.
  const codeLijstId = `bestekcodes-${meetstaatId}`
  const bekendeCodes = Array.from(new Set(
    [...getMeetregels(meetstaatId), ...regels].map(r => normaliseerBestekcode(r.bestekcode)).filter(Boolean)
  )).sort()

  // Laad regels voor deze groep
  useEffect(() => {
    const opgeslagen = getMeetregels(meetstaatId).filter(r => r.groep_id === groepId)
    const sorted = opgeslagen.sort((a, b) => a.volgorde - b.volgorde)
    // Lege slotregel erbij; die spiegelt meteen het element van de onderste regel,
    // zodat verder meten in een bestaande groep net zo werkt als doortypen.
    const laatste = sorted[sorted.length - 1]
    const legeRij: Meetregel = {
      ...nieuweLegeRegel(meetstaatId, groepId, (laatste?.volgorde ?? 0) + 10),
      element: laatste?.element,
      bestekcode: laatste?.bestekcode,
    }
    setRegels([...sorted, legeRij])
    // Zet focus op eerste lege rij
    setActieveId(legeRij.id)
    setFocusRijId(legeRij.id)
    setGeselecteerd(new Set())
  }, [meetstaatId, groepId])

  /**
   * Zorgt voor precies één lege regel onderaan, die het element en de bestekscode
   * van de regel erboven spiegelt. Bij het opmeten hoort een reeks regels bij
   * hetzelfde element, en dat wil je niet elke keer opnieuw typen.
   *
   * Bewust *spiegelen* en niet eenmalig overnemen: erfde de lege regel alleen bij
   * zijn aanmaak, dan bleef hij staan op het element dat je daarna wijzigde, en
   * bij het openen van een groep met bestaande regels erfde hij helemaal niets.
   * Een lege regel draagt per definitie geen eigen invoer, dus er gaat niets
   * verloren door hem steeds bij te trekken — zodra je erin typt is hij niet meer
   * leeg en blijft hij ongemoeid.
   */
  const metLegeSlotregel = useCallback((huidigeRegels: Meetregel[]): Meetregel[] => {
    const gevuld = huidigeRegels.filter(r => !r.is_leeg)
    const laatste = gevuld[gevuld.length - 1]
    const max = Math.max(...huidigeRegels.map(r => r.volgorde), 0)
    const lege = huidigeRegels.find(r => r.is_leeg)
      ?? nieuweLegeRegel(meetstaatId, groepId, max + 10)
    return [...gevuld, {
      ...lege,
      element: laatste?.element,
      bestekcode: laatste?.bestekcode,
    }]
  }, [meetstaatId, groepId])

  const onWijzig = useCallback((id: string, patch: Partial<Meetregel>) => {
    setRegels(prev => {
      const bijgewerkt = prev.map(r => {
        if (r.id !== id) return r
        const nieuw = { ...r, ...patch, is_leeg: false }

        // Debounced opslaan
        clearTimeout((nieuw as any)._saveTimer)
        ;(nieuw as any)._saveTimer = setTimeout(() => {
          if (!nieuw.is_leeg) {
            slaMeetregelOp(nieuw)
            // Herbereken aggregaat
            const oudSleutel = aggregaatSleutel(r)
            const nieuwSleutel = aggregaatSleutel(nieuw)
            if (oudSleutel) herberekeningAggregaat(meetstaatId, oudSleutel)
            if (nieuwSleutel && nieuwSleutel !== oudSleutel) herberekeningAggregaat(meetstaatId, nieuwSleutel)
            onWijziging?.()
          }
        }, 500)

        return nieuw
      })

      return metLegeSlotregel(bijgewerkt)
    })
  }, [meetstaatId, metLegeSlotregel])

  const onEnter = useCallback((id: string) => {
    setRegels(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx === -1) return prev

      const regel = prev[idx]

      // Sla op als actief
      if (isRegelActief(regel)) {
        const definitief = { ...regel, is_leeg: false }
        slaMeetregelOp(definitief)
        const sleutel = aggregaatSleutel(definitief)
        if (sleutel) herberekeningAggregaat(meetstaatId, sleutel)
        onWijziging?.()

        // De lege slotregel neemt hier vanzelf element en bestekscode over.
        const resultaat = metLegeSlotregel(prev.map(r => r.id === id ? definitief : r))

        // Focus volgende (lege) rij
        const volgende = resultaat[idx + 1] ?? resultaat[resultaat.length - 1]
        setTimeout(() => {
          setActieveId(volgende?.id ?? null)
          setFocusRijId(volgende?.id ?? null)
        }, 0)

        return resultaat
      }
      return prev
    })
  }, [meetstaatId, metLegeSlotregel, onWijziging])

  const onVerwijder = useCallback((id: string) => {
    setRegels(prev => {
      const regel = prev.find(r => r.id === id)
      if (regel && !regel.is_leeg) {
        verwijderMeetregel(id)
        const sleutel = aggregaatSleutel(regel)
        if (sleutel) herberekeningAggregaat(meetstaatId, sleutel)
        onWijziging?.()
      }
      const gefilterd = prev.filter(r => r.id !== id)
      return metLegeSlotregel(gefilterd)
    })
    setGeselecteerd(prev => {
      if (!prev.has(id)) return prev
      const volgend = new Set(prev)
      volgend.delete(id)
      return volgend
    })
  }, [meetstaatId, metLegeSlotregel, onWijziging])

  // ─── Pijltoetsnavigatie ────────────────────────────────────────────────────
  // Elk bewerkbaar veld draagt data-cel="rij:kolom" (nummering in MeetregelRij).
  // Ontbrekende cellen — Type en Behandeling tonen tekst zolang er niets gekozen
  // is — worden overgeslagen in plaats van de navigatie te laten doodlopen.

  const gefocust = useCallback(() => setFocusRijId(null), [])

  const focusCel = useCallback((rij: number, kol: number): boolean => {
    const el = bladRef.current?.querySelector<HTMLInputElement>(`[data-cel="${rij}:${kol}"]`)
    if (!el) return false
    el.focus()
    try { el.select() } catch { /* niet elk veld kan zijn inhoud selecteren */ }
    return true
  }, [])

  const onBladKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const richting =
      e.key === 'ArrowUp' ? 'omhoog' : e.key === 'ArrowDown' ? 'omlaag' :
      e.key === 'ArrowLeft' ? 'links' : e.key === 'ArrowRight' ? 'rechts' : null
    if (!richting) return

    const veld = e.target as HTMLInputElement
    const adres = veld.getAttribute?.('data-cel')
    if (!adres) return
    const [rij, kol] = adres.split(':').map(Number)

    if (richting === 'links' || richting === 'rechts') {
      if (!magCelVerlaten(veld, richting)) return
      const stap = richting === 'links' ? -1 : 1
      for (let k = kol + stap; k >= 0 && k <= LAATSTE_KOL; k += stap) {
        if (focusCel(rij, k)) { e.preventDefault(); return }
      }
      return
    }

    // Verticaal altijd afvangen: zonder preventDefault telt een getalveld bij
    // pijl omhoog/omlaag zijn eigen waarde op of af, en verandert navigeren je maten.
    e.preventDefault()
    const doelRij = richting === 'omhoog' ? rij - 1 : rij + 1
    if (doelRij < 0 || doelRij >= regels.length) return
    // Bestaat de kolom in de doelrij niet, val dan terug op de dichtstbijzijnde links.
    for (let k = kol; k >= 0; k--) if (focusCel(doelRij, k)) return
  }, [focusCel, regels.length])

  // ─── Elementen ─────────────────────────────────────────────────────────────

  const geselecteerdeRegels = regels.filter(r => geselecteerd.has(r.id))
  const bestaandeRegels = regels.filter(r => !r.is_leeg)
  const allesGeselecteerd = bestaandeRegels.length > 0 && bestaandeRegels.every(r => geselecteerd.has(r.id))
  void elementTeller // herteken de knopstatus nadat er een element bij komt of afgaat
  const aantalElementen = getMeetstaatElementen(meetstaatId).length

  const selecteer = useCallback((id: string, aan: boolean) => {
    setGeselecteerd(prev => {
      const volgend = new Set(prev)
      if (aan) volgend.add(id); else volgend.delete(id)
      return volgend
    })
  }, [])

  const selecteerAlles = useCallback((aan: boolean) => {
    setGeselecteerd(aan ? new Set(regels.filter(r => !r.is_leeg).map(r => r.id)) : new Set())
  }, [regels])

  /**
   * Plakt de regels van een bewaard element onderaan de huidige groep. Het element
   * is de maatvoering van één stuk; `aantal` zegt hoe vaak dat stuk hier voorkomt en
   * komt op elke ingevoegde regel te staan.
   */
  const voegElementToe = useCallback((el: MeetstaatElement, aantal: number) => {
    const bestaand = getMeetregels(meetstaatId).filter(r => r.groep_id === groepId)
    const max = Math.max(...bestaand.map(r => r.volgorde), 0)
    const nu = new Date().toISOString()

    const nieuweRegels: Meetregel[] = el.regels.map((er, i) => ({
      ...er,
      id: nieuweId(),
      meetstaat_id: meetstaatId,
      groep_id: groepId,
      volgorde: max + (i + 1) * 10,
      aantal,
      eenheid: er.eenheid || 'm²',
      is_leeg: false,
      aangepast_op: nu,
    }))

    nieuweRegels.forEach(slaMeetregelOp)
    const sleutels = new Set(
      nieuweRegels.map(aggregaatSleutel).filter((s): s is string => s !== null)
    )
    sleutels.forEach(s => herberekeningAggregaat(meetstaatId, s))

    // De oude lege rij vervalt; metLegeSlotregel maakt een verse die het element van de
    // laatst ingevoegde regel overneemt. Een lege rij draagt niets, dus er gaat niets verloren.
    setRegels(prev => metLegeSlotregel([...prev.filter(r => !r.is_leeg), ...nieuweRegels]))
    onWijziging?.()
    setKiezerOpen(false)
    toast.success(
      `"${el.naam}" ${aantal}× toegevoegd (${nieuweRegels.length} ${nieuweRegels.length === 1 ? 'regel' : 'regels'})`
    )
  }, [meetstaatId, groepId, metLegeSlotregel, onWijziging])

  const actieveRegels = regels.filter(r => !r.is_leeg && isRegelActief(r))
  // Bestaande regels met maar een deel van de maten: die tellen niet mee, en dat moet je zien.
  const aantalOnvolledig = regels.filter(r => !r.is_leeg && ontbrekendeMaat(r)).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Groepheader */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-neutral-200 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{groep?.naam ?? 'Groep'}</h2>
          <p className="text-xs text-neutral-500">
            {actieveRegels.length} {actieveRegels.length === 1 ? 'meetregel' : 'meetregels'}
            {aantalOnvolledig > 0 && (
              <span className="font-semibold text-warning-700">
                {' · '}{aantalOnvolledig} {aantalOnvolledig === 1 ? 'onvolledige regel telt' : 'onvolledige regels tellen'} niet mee
              </span>
            )}
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => setKiezerOpen(true)}
          disabled={aantalElementen === 0}
          title={aantalElementen === 0
            ? 'Nog geen elementen bewaard in deze meetstaat. Vink regels aan om er een te bewaren.'
            : 'Een bewaard element in deze groep invoegen'}
        >
          <Boxes className="w-4 h-4" />
          <span className="hidden sm:inline">Element invoegen</span>
        </Button>
      </div>

      {/* Selectiebalk: wat je met aangevinkte regels kunt, verschijnt pas als je iets aanvinkt */}
      {geselecteerd.size > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-brand-900 text-white flex flex-wrap items-center gap-4 text-[13px]">
          <span className="font-semibold">
            {geselecteerd.size} {geselecteerd.size === 1 ? 'regel' : 'regels'} geselecteerd
          </span>
          <button
            onClick={() => setOpslaanOpen(true)}
            className="flex items-center gap-1.5 font-semibold text-brand-200 hover:text-white"
          >
            <BookmarkPlus className="w-4 h-4" />
            Bewaar als element
          </button>
          <button
            onClick={() => setGeselecteerd(new Set())}
            className="ml-auto font-medium text-neutral-300 hover:text-white"
          >
            Selectie opheffen
          </button>
        </div>
      )}

      {/* Grid */}
      <datalist id={codeLijstId}>
        {bekendeCodes.map(c => <option key={c} value={c} />)}
      </datalist>
      <div ref={bladRef} onKeyDown={onBladKeyDown} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: '1220px' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-neutral-100 border-b border-neutral-200 text-[10.5px] font-semibold text-neutral-500 uppercase tracking-[0.08em]">
              <th className="w-8 px-1 py-2 text-center font-medium">
                <input
                  type="checkbox"
                  checked={allesGeselecteerd}
                  onChange={e => selecteerAlles(e.target.checked)}
                  disabled={bestaandeRegels.length === 0}
                  title="Alle meetregels in deze groep selecteren"
                  className="w-3.5 h-3.5 rounded border-slate-300 text-everts focus:ring-everts/40 cursor-pointer
                             disabled:opacity-40 disabled:cursor-default"
                />
              </th>
              <th className="w-8 px-2 py-2 text-center font-medium">#</th>
              <th className="min-w-[140px] px-2 py-2 text-left font-medium">Element</th>
              <th className="min-w-[160px] px-2 py-2 text-left font-medium">Onderdeel</th>
              <th className="min-w-[140px] px-2 py-2 text-left font-medium">Type</th>
              <th className="min-w-[96px] px-2 py-2 text-left font-medium" title="Bestekscode; de behandeling koppel je per code in de calculatie">Code</th>
              <th className="w-16 px-1 py-2 text-right font-medium text-blue-500">B (m)</th>
              <th className="w-16 px-1 py-2 text-right font-medium text-blue-500">H (m)</th>
              <th className="w-14 px-1 py-2 text-right font-medium text-blue-400"
                  title="Breedte aantal — hoeveel breedtes je meet. Telt alleen mee bij m¹.">B aant.</th>
              <th className="w-14 px-1 py-2 text-right font-medium text-blue-400"
                  title="Hoogte aantal — hoeveel hoogtes je meet. Telt alleen mee bij m¹.">H aant.</th>
              <th className="w-14 px-1 py-2 text-right font-medium" title="Hoe vaak dit binnen één element voorkomt (bijv. 2 ramen in één kozijn)">x</th>
              <th className="w-14 px-1 py-2 text-right font-medium" title="Hoe vaak het element in totaal voorkomt">Aantal</th>
              <th className="w-20 px-2 py-2 text-right font-medium text-everts">Hoev.</th>
              <th className="w-12 px-1 py-2 text-center font-medium">Eenh.</th>
              <th className="min-w-[160px] px-2 py-2 text-left font-medium">Opmerking</th>
              <th className="w-7 px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {regels.map((r, i) => (
              <MeetregelRij
                key={r.id}
                regel={r}
                volgnummer={i + 1}
                rijIndex={i}
                isActief={r.id === actieveId}
                moetFocussen={r.id === focusRijId}
                onGefocust={gefocust}
                isGeselecteerd={geselecteerd.has(r.id)}
                onSelecteer={aan => selecteer(r.id, aan)}
                onFocus={() => setActieveId(r.id)}
                onWijzig={patch => onWijzig(r.id, patch)}
                onEnter={() => onEnter(r.id)}
                onVerwijder={() => onVerwijder(r.id)}
                schilderData={schilderData}
                codeLijstId={codeLijstId}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-t border-neutral-200 bg-neutral-50 flex flex-wrap gap-4 text-xs text-neutral-500">
        <span><b className="font-semibold text-neutral-700">Enter</b> volgende regel</span>
        <span><b className="font-semibold text-neutral-700">↑ ↓ ← →</b> door de cellen</span>
        <span>Vink regels aan om ze als element te bewaren</span>
      </div>

      <NaarCalculatieTabel meetstaatId={meetstaatId} groepId={groepId} groepNaam={groep?.naam ?? 'deze groep'} />

      {opslaanOpen && (
        <ElementOpslaanDialog
          meetstaatId={meetstaatId}
          regels={geselecteerdeRegels}
          standaardNaam={groep?.naam ?? 'Element'}
          onOpgeslagen={() => {
            setOpslaanOpen(false)
            setGeselecteerd(new Set())
            setElementTeller(n => n + 1)
            onWijziging?.()
          }}
          onSluit={() => setOpslaanOpen(false)}
        />
      )}

      {kiezerOpen && (
        <ElementKiezerDialog
          meetstaatId={meetstaatId}
          groepNaam={groep?.naam ?? 'deze groep'}
          onKies={voegElementToe}
          onWijziging={() => { setElementTeller(n => n + 1); onWijziging?.() }}
          onSluit={() => setKiezerOpen(false)}
        />
      )}
    </div>
  )
}
