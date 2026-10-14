'use client'

import { useState, useEffect, useRef, cloneElement } from 'react'
import type { ReactElement } from 'react'
import { Trash2, ChevronDown, ChevronRight, AlignLeft, Search, BookmarkPlus, TriangleAlert } from 'lucide-react'
import { standaardUurtarief } from '@/lib/everts-calc/local-store'
import { berekenCalculatieregel, formatEuro, formatGetal, parseGetal } from '@/lib/everts-calc/calculations'
import { cn } from '@/lib/everts-calc/utils'
import type { Calculatieregel, Componentregel, Eenheid, EenheidConfig } from '@/lib/everts-calc/types'
import ActiviteitToevoegenModal from '@/components/everts-calc/calculatie/ActiviteitToevoegenModal'
import MiniMeetstaat from '@/components/everts-calc/calculatie/MiniMeetstaat'
import { tariefKort, vindTarief, type BtwTariefKeuze } from '@/lib/stamdata/btw'
import { behandelingSuffix as maakBehandelingSuffix } from '@/lib/everts-calc/behandeling-label'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import type { BibliotheekItemVereenvoudigd } from '@/lib/everts-calc/types'
import { type ColId, COL_MAP } from './kolommen'
import { GetalInput } from './GetalInput'
import { OmschrijvingVeld } from './OmschrijvingVeld'
import { WerkomschrijvingRij, RegelComponentenBlok } from './RegelDetail'
import { OpslaanAlsReceptModal } from './OpslaanAlsReceptModal'
import { kiesBtwTarief } from './btw-keuze'

export interface RegelRijProps {
  regel: Calculatieregel
  componenten: Componentregel[]
  diepte: number
  defaultOpslag: number
  /** Uurtarief van de calculatie. Alleen als signaal: wijzigt het, dan herlezen regels
   *  zonder eigen arbeidstarief het standaardtarief. */
  standaardTarief?: number
  colOrder: ColId[]
  btwTarieven: BtwTariefKeuze[]
  uurtarieven: { label: string; tarief: number }[]
  eenheden: EenheidConfig[]
  scenarioId: string
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onWijzigComponent: (id: string, type: Componentregel['type'], norm: number, tarief: number) => void
  onWijzigComponentExtra: (compId: string, patch: Partial<Componentregel>) => void
  onVoegComponentToe: (regelId: string, type: Componentregel['type']) => void
  onVerwijderComponent: (compId: string) => void
  onVerwijder: () => void
  onHerlaad: () => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  /** Bibliotheek van schilderbehandelingen; één keer geladen door het grid. */
  behandelingen?: SchilderBehandeling[]
  isGeselecteerd?: boolean
  onSelecteer?: (ctrlKey: boolean, shiftKey: boolean) => void
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  collapseSignal?: number
  readOnly?: boolean
}

export function CalculatieregelRij({
  regel, componenten, diepte, defaultOpslag, standaardTarief, colOrder, btwTarieven, uurtarieven, eenheden, scenarioId,
  onWijzig, onWijzigComponent, onWijzigComponentExtra, onVoegComponentToe, onVerwijderComponent, onVerwijder, onHerlaad,
  bibliotheekItems, behandelingen = [],
  isGeselecteerd, onSelecteer,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  collapseSignal, readOnly = false,
}: RegelRijProps) {
  const regelComps = componenten.filter(c => c.calculatieregel_id === regel.id)
  const ab = regelComps.find(c => c.type === 'arbeid')
  const mt = regelComps.find(c => c.type === 'materieel')
  const oa = regelComps.find(c => c.type === 'onderaanneming')
  const allAb = regelComps.filter(c => c.type === 'arbeid')
  const allMt = regelComps.filter(c => c.type === 'materieel')
  const allOa = regelComps.filter(c => c.type === 'onderaanneming')
  const multiAb = allAb.length > 1
  const multiMt = allMt.length > 1
  const multiOa = allOa.length > 1
  const opslag = regel.opslag_pct ?? defaultOpslag

  const [abUren,   setAbUren]   = useState(ab?.norm_hoeveelheid ?? 0)
  const [abMin,    setAbMin]    = useState((ab?.norm_hoeveelheid ?? 0) * 60)
  // Zonder eigen tarief toont (en rekent) de arbeidskolom met het standaardtarief uit
  // Stamgegevens → Uursoorten & uurtarieven; typ je hier uren, dan gaat dat tarief mee.
  const [abTarief, setAbTarief] = useState(ab?.tarief || standaardUurtarief(regel.id))
  const [mtPrijs,  setMtPrijs]  = useState(mt?.tarief ?? 0)
  const [oaPrijs,  setOaPrijs]  = useState(oa?.tarief ?? 0)

  useEffect(() => {
    setAbUren(ab?.norm_hoeveelheid ?? 0)
    setAbMin((ab?.norm_hoeveelheid ?? 0) * 60)
    setAbTarief(ab?.tarief || standaardUurtarief(regel.id))
  }, [ab?.norm_hoeveelheid, ab?.tarief, regel.id, standaardTarief])
  useEffect(() => { setMtPrijs(mt?.tarief ?? 0) }, [mt?.tarief])
  useEffect(() => { setOaPrijs(oa?.tarief ?? 0) }, [oa?.tarief])
  const compOpslagHash = regelComps.map(c => `${c.id}:${c.opslag_pct}`).join(',')
  useEffect(() => {
    const hasOverride = regelComps.some(c => c.opslag_pct !== undefined)
    if (!hasOverride || kp_pe === 0) return
    const avg = +((vp_pe / kp_pe - 1) * 100).toFixed(2)
    onWijzig(regel.id, { opslag_pct: avg })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compOpslagHash])

  const debRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const deb = (key: string, fn: () => void, ms = 400) => {
    clearTimeout(debRef.current[key]); debRef.current[key] = setTimeout(fn, ms)
  }

  // Uur ↔ Min bidirectioneel
  const onUrenChange = (v: number) => {
    setAbUren(v); setAbMin(+(v * 60).toFixed(2))
    deb('ab', () => onWijzigComponent(regel.id, 'arbeid', v, abTarief))
  }
  const onMinChange = (v: number) => {
    const u = +(v / 60).toFixed(4); setAbMin(v); setAbUren(u)
    deb('ab', () => onWijzigComponent(regel.id, 'arbeid', u, abTarief))
  }
  const onTariefAb = (v: number) => {
    setAbTarief(v); deb('abt', () => onWijzigComponent(regel.id, 'arbeid', abUren, v))
  }

  // Hoeveelheid van het enkele materiaal- of OA-component. De snelinvoerkolom in deze
  // rij bewerkt alleen de prijs; de hoeveelheid komt van de detailregel eronder en mag
  // hier nooit op 1 worden vastgezet — dan telt de rij een detailregel met hoeveelheid 2
  // maar één keer mee, terwijl het groepstotaal (dat met de opgeslagen componenten
  // rekent) wél klopt. Zonder component nog: 1, zoals een nieuw component krijgt.
  const mtNorm = mt?.norm_hoeveelheid ?? 1
  const oaNorm = oa?.norm_hoeveelheid ?? 1

  // Berekende waarden (op basis van lokale state)
  // `!== 0` en niet `> 0`: een minderwerkregel heeft een negatieve prijs en moet
  // net zo goed uit de lokale edit-staat komen, anders zie je tijdens het typen
  // nog de opgeslagen (of lege) waarde in plaats van je eigen invoer.
  const tmpComps = [
    ...(!multiAb && (abUren !== 0 || abTarief !== 0) ? [{ id: 'ab', calculatieregel_id: regel.id, type: 'arbeid'         as const, norm_hoeveelheid: abUren, tarief: abTarief, opslag_pct: ab?.opslag_pct }] : allAb),
    ...(!multiMt && mtPrijs !== 0                     ? [{ id: 'mt', calculatieregel_id: regel.id, type: 'materieel'      as const, norm_hoeveelheid: mtNorm, tarief: mtPrijs,  opslag_pct: mt?.opslag_pct }] : allMt),
    ...(!multiOa && oaPrijs !== 0                     ? [{ id: 'oa', calculatieregel_id: regel.id, type: 'onderaanneming' as const, norm_hoeveelheid: oaNorm, tarief: oaPrijs,  opslag_pct: oa?.opslag_pct }] : allOa),
  ]
  const { arbeid_totaal, materieel_totaal, oa_totaal, kp_pe, kp_totaal, uren_pe, uren_totaal, vp_pe, vp_totaal } =
    berekenCalculatieregel(regel, tmpComps, opslag)

  const hasCompOverride = regelComps.some(c => c.opslag_pct !== undefined)
  const displayOpslag = hasCompOverride && kp_pe !== 0
    ? +((vp_pe / kp_pe - 1) * 100).toFixed(2)
    : opslag
  /** Wijkt deze regel af van de standaard-opslag? Ook 0% telt als afwijking. */
  const heeftEigenOpslag = regel.opslag_pct !== undefined || hasCompOverride

  // Terugrekenen totaalprijs → eenheidsprijs
  const onBedragAb = (v: number) => {
    if (abUren !== 0 && regel.hoeveelheid !== 0) {
      const t = +(v / (abUren * regel.hoeveelheid)).toFixed(4)
      setAbTarief(t); deb('abt', () => onWijzigComponent(regel.id, 'arbeid', abUren, t))
    }
  }
  const onBedragMt = (v: number) => {
    if (v !== 0 && mtNorm !== 0 && regel.hoeveelheid !== 0) {
      const t = +(v / (mtNorm * regel.hoeveelheid)).toFixed(4)
      setMtPrijs(t); deb('mt', () => onWijzigComponent(regel.id, 'materieel', mtNorm, t))
    }
  }
  const onBedragOa = (v: number) => {
    if (v !== 0 && oaNorm !== 0 && regel.hoeveelheid !== 0) {
      const t = +(v / (oaNorm * regel.hoeveelheid)).toFixed(4)
      setOaPrijs(t); deb('oa', () => onWijzigComponent(regel.id, 'onderaanneming', oaNorm, t))
    }
  }

  const [werkUitgeklapt,         setWerkUitgeklapt]         = useState(false)
  const [compsUitgeklapt,        setCompsUitgeklapt]        = useState(false)
  useEffect(() => { if (collapseSignal) setCompsUitgeklapt(false) }, [collapseSignal])
  const [opmerkingOpen,          setOpmerkingOpen]          = useState(!!(regel.opmerking))
  const heeftBehandeling = !!(regel.schilderbehandeling_id || regel.schilderbehandeling)
  const behandelingNaam = regel.schilderbehandeling_id
    ? behandelingen.find(b => b.id === regel.schilderbehandeling_id)?.naam ?? ''
    : ''
  const behandelingSuffix = maakBehandelingSuffix(regel.omschrijving, behandelingNaam)
  const [schilderbehandelingOpen, setSchilderbehandelingOpen] = useState(heeftBehandeling)
  const [biblOpen,        setBiblOpen]        = useState(false)
  // Lokale edit-state voor totaalbedragen en verkoopprijzen
  const [mtBedragEdit, setMtBedragEdit] = useState<string | null>(null)
  const [oaBedragEdit, setOaBedragEdit] = useState<string | null>(null)
  const [vpEenhEdit,   setVpEenhEdit]   = useState<string | null>(null)
  const [totVpEdit,    setTotVpEdit]    = useState<string | null>(null)
  const [receptModalOpen, setReceptModalOpen] = useState(false)
  const [miniMeetstaat, setMiniMeetstaat]     = useState(false)

  // Uren zonder uurtarief: zo'n regel telt voor € 0 arbeid mee. Sinds de terugval op
  // het standaardtarief kan dat alleen nog als er nergens een tarief is ingesteld, of
  // bij een bevroren calculatie — maar dan wil je het wel zien.
  const geenUurtarief = multiAb
    ? allAb.some(c => c.norm_hoeveelheid !== 0 && !c.tarief)
    : abUren !== 0 && !abTarief

  const indent = 4
  const isSP   = regel.is_stelpost ?? false
  const isVRR  = regel.is_verrekenbaar ?? false
  const rowCls = regel.gemarkeerd ? 'bg-orange-50 italic' : isVRR ? 'bg-teal-50/40' : ''

  const ni = (val: number, onChange: (v: number) => void, decimalen = 2) => (
    <GetalInput
      waarde={val}
      decimalen={decimalen}
      onChange={onChange}
      className="w-full text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent
        hover:bg-slate-50 hover:border hover:border-slate-200
        focus:bg-white focus:border focus:border-everts/40 focus:outline-none
        text-slate-700 placeholder-slate-200"
    />
  )

  const euro = (v: number, cls = 'text-slate-600') =>
    v !== 0
      ? <span className={` text-xs ${cls}`}>{formatEuro(v)}</span>
      : <span className="text-slate-200 text-xs">—</span>

  const renderCell = (id: ColId): React.ReactNode => {
    const col = COL_MAP[id]
    const base = `${col.tdCls ?? ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`
    const tdSt = col.tdStyle

    switch (id) {
      case 'kostengroep': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            className="w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent
              hover:bg-slate-50 hover:border hover:border-slate-200
              focus:bg-white focus:border focus:border-everts/40 focus:outline-none
              text-slate-600 placeholder-slate-300"
            value={regel.kostengroep ?? ''}
            placeholder="Groep…"
            list="kg-suggestions"
            onChange={e => onWijzig(regel.id, { kostengroep: e.target.value || undefined })}
          />
        </td>
      )
      case 'omschrijving': return (
        <td key={id} className={`py-1 ${isSP || regel.gemarkeerd ? 'italic' : ''}`} style={{ paddingLeft: `${indent}px`, paddingRight: '4px' }}>
          <div className="flex items-center gap-1">
            {/* Drag handle */}
            {onDragStart && (
              <span className="flex-shrink-0 opacity-20 group-hover:opacity-60 text-slate-500 cursor-grab text-sm select-none px-0.5" title="Versleep om te herordenen">⠿</span>
            )}
            {/* Vergrootglas: helemaal links */}
            <button
              onClick={e => { e.stopPropagation(); setBiblOpen(true) }}
              className="flex-shrink-0 p-0.5 rounded text-slate-300 hover:text-everts hover:bg-everts-50 opacity-0 group-hover:opacity-100 transition-all"
              title="Zoeken in bibliotheek"
            >
              <Search className="w-3 h-3" />
            </button>
            <ActiviteitToevoegenModal
              open={biblOpen}
              onClose={() => setBiblOpen(false)}
              elementId={regel.groep_id}
              scenarioId={scenarioId}
              onToegevoegd={() => { setBiblOpen(false); onHerlaad() }}
              bibliotheekItems={bibliotheekItems}
            />
            {isSP  && <span className="text-[10px] text-amber-500 font-semibold flex-shrink-0">[STP]</span>}
            {isVRR && <span className="text-[10px] text-teal-600 font-semibold flex-shrink-0">[VRR]</span>}
            {regel.meetstaat_aggregaat_id && (
              <span
                className="flex-shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-teal-50 text-teal-600 border border-teal-200 leading-none"
                title="Afkomstig uit meetstaat"
              >MS</span>
            )}
            {geenUurtarief && (
              <span
                className="flex-shrink-0 text-amber-500"
                title="Uren zonder uurtarief — deze regel telt voor € 0 arbeid mee. Vul een tarief in, of stel er een in bij Stamgegevens → Uursoorten & uurtarieven."
              >
                <TriangleAlert className="w-3 h-3" />
              </span>
            )}
            <OmschrijvingVeld
              waarde={regel.omschrijving}
              italic={regel.gemarkeerd}
              onWijzig={v => onWijzig(regel.id, { omschrijving: v })}
            />
            {/* Naam van de gekoppelde behandeling, afgeleid uit de bibliotheek — hij
                staat bewust náást het invoerveld, niet erin, zodat `omschrijving` de
                eigen tekst blijft. Belandt zo ook in de offerteregel. */}
            {behandelingSuffix && (
              <span
                className="flex-shrink min-w-0 truncate text-xs text-slate-500"
                title={`Schilderbehandeling: ${behandelingNaam}`}
              >
                {behandelingSuffix}
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={() => setWerkUitgeklapt(v => !v)}
              className={`flex-shrink-0 p-0.5 rounded transition-colors cursor-pointer ${
                // Ook groen als er alléén een foto onder hangt: anders lijkt de regel leeg
                // terwijl er wel degelijk iets in staat dat op de offerte komt.
                werkUitgeklapt || regel.werkomschrijving || regel.werkomschrijving_afbeeldingen?.length
                  ? 'text-everts bg-everts-50'
                  : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
              }`}
              title="Uitgebreide werkomschrijving"
            >
              <AlignLeft className="w-3 h-3" />
            </span>
            {/* Expand componentregels: rechts */}
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); setCompsUitgeklapt(v => !v) }}
              className={`flex-shrink-0 p-0.5 rounded transition-colors cursor-pointer ${
                compsUitgeklapt
                  ? 'text-everts bg-everts-50'
                  : regelComps.length > 0
                    ? 'text-slate-400 hover:text-everts hover:bg-everts-50'
                    : 'text-slate-200 hover:text-slate-400'
              }`}
              title="Componentregels tonen"
            >
              {compsUitgeklapt
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </span>
            {regel.opmerking && !compsUitgeklapt && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Heeft interne opmerking" />
            )}
            {heeftBehandeling && !compsUitgeklapt && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Heeft schilderbehandeling" />
            )}
          </div>
        </td>
      )
      case 'aant': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {regel.meetstaat_aggregaat_id ? (
            <span
              className="w-full text-xs text-right  font-semibold px-1 py-0.5 block text-teal-600"
              title="Hoeveelheid vastgesteld door meetstaat — pas aan in de meetstaat"
            >
              {regel.hoeveelheid === 0 ? '—' : formatGetal(regel.hoeveelheid, 2)}
            </span>
          ) : (
            <>
              <GetalInput
                waarde={regel.hoeveelheid}
                onChange={v => onWijzig(regel.id, { hoeveelheid: v })}
                className="w-full text-xs text-right  font-semibold px-1 py-0.5 rounded border-0 bg-transparent
                  hover:bg-slate-50 hover:border hover:border-slate-200
                  focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-800"
                onDoubleClick={e => { e.stopPropagation(); setMiniMeetstaat(true) }}
                title="Dubbelklik om te meten"
              />
              <MiniMeetstaat
                open={miniMeetstaat}
                eenheid={regel.eenheid}
                hoeveelheid={regel.hoeveelheid}
                onSluiten={() => setMiniMeetstaat(false)}
                onBevestig={(hoeveelheid, eenheid) => {
                  onWijzig(regel.id, { hoeveelheid, ...(eenheid ? { eenheid } : {}) })
                  setMiniMeetstaat(false)
                }}
              />
            </>
          )}
        </td>
      )
      case 'code': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {regel.bestekcode && (
            <span className="text-xs font-semibold text-info-700 px-1 py-0.5 block truncate" title="Bestekscode uit de meetstaat">
              {regel.bestekcode}
            </span>
          )}
        </td>
      )
      case 'eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {regel.meetstaat_aggregaat_id ? (
            <span
              className="text-xs  text-teal-600 font-semibold px-1 py-0.5 block"
              title="Eenheid vastgesteld door meetstaat"
            >
              {regel.eenheid}
            </span>
          ) : (
            <select
              value={regel.eenheid}
              className="w-full text-xs px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-slate-50 hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-600"
              onChange={e => {
                const eenh = e.target.value as Eenheid
                const patch: Partial<Calculatieregel> = { eenheid: eenh }
                // STP → Stelpost, VRR → Verrekenbaar (legacy volledige woorden blijven werken)
                patch.is_stelpost = eenh === 'STP' || eenh === 'Stelpost'
                patch.is_verrekenbaar = eenh === 'VRR' || eenh === 'Verrekenbaar'
                onWijzig(regel.id, patch)
              }}
            >
              {eenheden.map(e => <option key={e.afkorting} value={e.afkorting} title={e.omschrijving}>{e.afkorting}</option>)}
              {/* Toon huidige eenheid als die niet in de lijst staat */}
              {!eenheden.some(e => e.afkorting === regel.eenheid) && (
                <option key={regel.eenheid} value={regel.eenheid}>{regel.eenheid}</option>
              )}
            </select>
          )}
        </td>
      )
      case 'stelpost': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="checkbox"
            checked={isSP}
            onChange={e => onWijzig(regel.id, { is_stelpost: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
            title="Stelpost (provisorische som)"
          />
        </td>
      )
      case 'verrekenbaar': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="checkbox"
            checked={isVRR}
            onChange={e => onWijzig(regel.id, { is_verrekenbaar: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-teal-500 cursor-pointer"
            title="Verrekenbaar (wordt apart getoond in offerte)"
          />
        </td>
      )
      case 'tot_uren': return (
        <td key={id} className={`px-2 py-1 text-right ${base}`} style={tdSt}>
          {uren_totaal !== 0
            ? <span className=" text-xs text-blue-700">{formatGetal(uren_totaal, 2)}</span>
            : <span className="text-slate-200">—</span>
          }
        </td>
      )
      case 'markeer': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <button
            onClick={() => onWijzig(regel.id, { gemarkeerd: !(regel.gemarkeerd ?? false) })}
            className={`w-4 h-4 rounded-full border-2 transition-colors mx-auto block ${
              regel.gemarkeerd
                ? 'bg-orange-400 border-orange-500'
                : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50'
            }`}
            title="Markeer / Hef markering op"
          />
        </td>
      )
      case 'uur_eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiAb
            ? <span className="text-xs  text-slate-400 block text-right px-1">{uren_pe !== 0 ? formatGetal(uren_pe, 2) : ''}</span>
            : ni(abUren, onUrenChange, 2)}
        </td>
      )
      case 'min_eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiAb
            ? <span className="text-xs  text-slate-400 block text-right px-1">{uren_pe !== 0 ? formatGetal(uren_pe * 60, 2) : ''}</span>
            : ni(abMin, onMinChange, 2)}
        </td>
      )
      case 'tarief_ab': return (
        <td
          key={id}
          className={`px-1 py-1 ${base}`}
          style={geenUurtarief ? { ...tdSt, backgroundColor: '#fef3c7' } : tdSt}
          title={geenUurtarief ? 'Uren zonder uurtarief — deze regel telt voor € 0 arbeid mee.' : undefined}
        >
          {multiAb
            ? <span className="text-xs  text-slate-300 block text-right px-1">—</span>
            : ni(abTarief, onTariefAb, 2)}
        </td>
      )
      case 'bedrag_ab': return <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>{ni(arbeid_totaal, onBedragAb, 2)}</td>
      case 'prijs_mt':  return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiMt
            ? <span className="text-xs  text-slate-300 block text-right px-1">—</span>
            : ni(mtPrijs, v => { setMtPrijs(v); deb('mt', () => onWijzigComponent(regel.id, 'materieel', mtNorm, v)) }, 2)}
        </td>
      )
      case 'bedrag_mt': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="text" inputMode="decimal"
            value={mtBedragEdit !== null ? mtBedragEdit : (materieel_totaal === 0 ? '' : formatGetal(materieel_totaal, 2))}
            onFocus={() => setMtBedragEdit(materieel_totaal === 0 ? '' : String(+materieel_totaal.toFixed(2)))}
            onChange={e => { setMtBedragEdit(e.target.value); onBedragMt(parseGetal(e.target.value)) }}
            onBlur={() => setMtBedragEdit(null)}
            className="w-full text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent hover:bg-slate-50 hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
          />
        </td>
      )
      case 'prijs_oa':  return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {multiOa
            ? <span className="text-xs  text-slate-300 block text-right px-1">—</span>
            : ni(oaPrijs, v => { setOaPrijs(v); deb('oa', () => onWijzigComponent(regel.id, 'onderaanneming', oaNorm, v)) }, 2)}
        </td>
      )
      case 'bedrag_oa': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          <input
            type="text" inputMode="decimal"
            value={oaBedragEdit !== null ? oaBedragEdit : (oa_totaal === 0 ? '' : formatGetal(oa_totaal, 2))}
            onFocus={() => setOaBedragEdit(oa_totaal === 0 ? '' : String(+oa_totaal.toFixed(2)))}
            onChange={e => { setOaBedragEdit(e.target.value); onBedragOa(parseGetal(e.target.value)) }}
            onBlur={() => setOaBedragEdit(null)}
            className="w-full text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent hover:bg-slate-50 hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
          />
        </td>
      )
      case 'kp_eenh': return (
        <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>{euro(kp_pe)}</td>
      )
      case 'tot_kp': return (
        <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>{euro(kp_totaal, 'text-everts-dark font-semibold')}</td>
      )
      case 'opslag_pct': return (
        <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>
          <div className="flex items-center justify-start gap-0.5">
            <input
              type="text" inputMode="decimal"
              // Leeg = geen eigen opslag, dus de standaard van de calculatie (placeholder).
              // Een ingevulde 0 is een échte keuze — verkoop tegen kostprijs — en moet
              // zichtbaar blijven staan, anders lijkt het alsof de standaard geldt.
              value={heeftEigenOpslag ? +displayOpslag.toFixed(2) : ''}
              placeholder={formatGetal(defaultOpslag, 2)}
              className="w-12 text-xs text-right  px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-white hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
              onChange={e => {
                // Veld leegmaken zet de regel terug op de standaard-opslag.
                const v = e.target.value === '' ? undefined : parseGetal(e.target.value)
                onWijzig(regel.id, { opslag_pct: v })
                if (ab) onWijzigComponentExtra(ab.id, { opslag_pct: undefined })
                if (mt) onWijzigComponentExtra(mt.id, { opslag_pct: undefined })
                if (oa) onWijzigComponentExtra(oa.id, { opslag_pct: undefined })
              }}
            />
            <span className="text-slate-400 text-[11px]">%</span>
          </div>
        </td>
      )
      case 'vp_eenh': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {vpEenhEdit !== null ? (
            <input
              autoFocus
              type="text" inputMode="decimal"
              value={vpEenhEdit}
              onChange={e => {
                setVpEenhEdit(e.target.value)
                const v = parseGetal(e.target.value)
                if (v !== 0 && kp_pe !== 0) {
                  const pct = +((v / kp_pe - 1) * 100).toFixed(2)
                  onWijzig(regel.id, { opslag_pct: pct })
                }
              }}
              onBlur={() => setVpEenhEdit(null)}
              className="w-full text-xs text-right  px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none text-everts"
            />
          ) : (
            <span
              className=" text-xs text-everts cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setVpEenhEdit(vp_pe === 0 ? '' : String(+vp_pe.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {vp_pe !== 0 ? formatEuro(vp_pe) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'tot_vp': return (
        <td key={id} className={`px-1 py-1 ${base}`} style={tdSt}>
          {totVpEdit !== null ? (
            <input
              autoFocus
              type="text" inputMode="decimal"
              value={totVpEdit}
              onChange={e => {
                setTotVpEdit(e.target.value)
                const v = parseGetal(e.target.value)
                if (v !== 0 && kp_pe !== 0 && regel.hoeveelheid !== 0) {
                  const vpPe = v / regel.hoeveelheid
                  const pct = +((vpPe / kp_pe - 1) * 100).toFixed(2)
                  onWijzig(regel.id, { opslag_pct: pct })
                }
              }}
              onBlur={() => setTotVpEdit(null)}
              className="w-full text-xs text-right  px-1 py-0.5 rounded border border-everts/40 bg-white focus:outline-none font-bold text-everts"
            />
          ) : (
            <span
              className=" text-xs text-everts font-bold cursor-text block w-full text-right px-1 py-0.5"
              onClick={() => setTotVpEdit(vp_totaal === 0 ? '' : String(+vp_totaal.toFixed(2)))}
              title="Klik om aan te passen"
            >
              {vp_totaal !== 0 ? formatEuro(vp_totaal) : <span className="text-slate-200">—</span>}
            </span>
          )}
        </td>
      )
      case 'btw_pct': {
        // Regels van vóór de tariefkoppeling dragen alleen een percentage; die vallen terug
        // op het niet-verlegde tarief met dat percentage.
        const gekozen = vindTarief(btwTarieven, regel.btw_tarief_id, regel.btw_pct)
        return (
          <td key={id} className={`px-2 py-1 ${base}`} style={tdSt}>
            <select
              value={gekozen?.id ?? ''}
              title={gekozen ? gekozen.label : undefined}
              onChange={e => onWijzig(regel.id, kiesBtwTarief(btwTarieven, e.target.value))}
              className="w-full text-xs  text-right px-1 py-0.5 rounded border-0 bg-transparent
                hover:bg-white hover:border hover:border-slate-200
                focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-700"
            >
              <option value="">—</option>
              {btwTarieven.map(t => (
                <option key={t.id} value={t.id}>{tariefKort(t)}</option>
              ))}
            </select>
          </td>
        )
      }
      case 'acties': return (
        <td key={id} className="px-1 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setReceptModalOpen(true)}
              className="p-1 text-slate-300 hover:text-everts rounded transition-colors"
              title="Opslaan als recept"
            >
              <BookmarkPlus className="w-3 h-3" />
            </button>
            <button
              onClick={onVerwijder}
              className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>
      )
      default: return <td key={id} />
    }
  }

  return (
    <>
      <tr
        data-regel-id={regel.id}
        className={cn(
          'group border-b border-slate-100 hover:bg-blue-100/60 transition-colors',
          rowCls,
          isGeselecteerd ? 'bg-everts/10 ring-1 ring-inset ring-everts/30' : '',
          isDragging ? 'opacity-40' : '',
          isDragOver ? 'border-t-2 border-t-everts' : ''
        )}
        draggable={!!onDragStart && !readOnly}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', regel.id); onDragStart?.(e) }}
        onDragOver={onDragOver}
        onDrop={e => { e.preventDefault(); onDrop?.(e) }}
        onDragEnd={onDragEnd}
        onMouseDown={e => {
          // Alleen preventDefault bij Shift om tekstselectie te voorkomen — dragging blijft werken
          if (e.shiftKey && !(e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) {
            e.preventDefault()
          }
        }}
        onClick={e => {
          if ((e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) return
          onSelecteer?.(e.ctrlKey || e.metaKey, e.shiftKey)
        }}
        style={{ cursor: onDragStart ? 'grab' : undefined }}
      >
        {colOrder.map(id => {
          const cell = renderCell(id)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return cell ? cloneElement(cell as ReactElement<any>, { 'data-col': id }) : null
        })}
      </tr>
      {werkUitgeklapt && (
        <WerkomschrijvingRij regel={regel} colOrder={colOrder} indent={indent} onWijzig={onWijzig} />
      )}
      {compsUitgeklapt && (
        <RegelComponentenBlok
          regel={regel} regelComps={regelComps} colOrder={colOrder} indent={indent} opslag={opslag}
          uurtarieven={uurtarieven} eenheden={eenheden} behandelingen={behandelingen} heeftBehandeling={heeftBehandeling}
          opmerkingOpen={opmerkingOpen} setOpmerkingOpen={setOpmerkingOpen}
          schilderbehandelingOpen={schilderbehandelingOpen} setSchilderbehandelingOpen={setSchilderbehandelingOpen}
          onWijzig={onWijzig} onWijzigComponentExtra={onWijzigComponentExtra}
          onVerwijderComponent={onVerwijderComponent} onVoegComponentToe={onVoegComponentToe}
        />
      )}
      {receptModalOpen && (
        <OpslaanAlsReceptModal
          regel={regel}
          componenten={regelComps}
          onSluiten={() => setReceptModalOpen(false)}
        />
      )}
    </>
  )
}
