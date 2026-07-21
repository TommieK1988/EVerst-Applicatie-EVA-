'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/houtrotherstel/utils'
import { getProject } from '@/services/houtrotherstel/projects'
import { getRegistraties, getPhotoUrl } from '@/services/houtrotherstel/registraties'
import { createClient } from '@/lib/houtrotherstel/supabase/client'
import { REGISTRATIE_STATUSSEN } from '@/lib/houtrotherstel/types'
import type { Project } from '@/lib/houtrotherstel/types'

const AFGEROND_STATUSSEN = ['gereed', 'gecontroleerd']

interface RepRegel {
  id: string
  naam: string | null
  omschrijving: string | null
  prijs: number
}

interface RegRapport {
  id: string
  datum: string | null
  medewerker: string | null
  status: string
  voorFoto: string | null
  naFoto: string | null
  locatieLabel: string
  reparaties: RepRegel[]
}

interface Sectie {
  naam: string
  omschrijving: string | null
  registraties: RegRapport[]
}

// Compact fotovak: echte foto = aspect-ratio, geen foto = kleine strook
function FotoVak({ src, label }: { src: string | null; label: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
      {src ? (
        <img
          src={src}
          alt={label}
          crossOrigin="anonymous"
          className="w-full aspect-[4/3] object-cover rounded-lg border border-slate-200 block"
        />
      ) : (
        <div className="w-full h-10 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
          <span className="text-[9px] text-slate-300 uppercase tracking-wide">Geen foto</span>
        </div>
      )}
    </div>
  )
}

export default function RapportagePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string
  const metPrijzen = searchParams.get('prijzen') === '1'

  const [project, setProject] = useState<Project | null>(null)
  const [secties, setSecties] = useState<Sectie[]>([])
  const [generating, setGenerating] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let afgebroken = false

    async function laad() {
      const [p, registraties] = await Promise.all([
        getProject(projectId),
        getRegistraties({ project_id: projectId }),
      ])
      if (afgebroken || !p) return
      setProject(p)

      const supabase = createClient()
      const fotoUrl = (pad: string | null | undefined) =>
        pad ? getPhotoUrl(supabase, pad) : null

      // Het echte datamodel kent géén projectdeel/locatie-hiërarchie; registraties
      // dragen hun plaats als losse velden. Groepeer daarom op `location_block`.
      const groepen = new Map<string, RegRapport[]>()

      for (const reg of registraties) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = reg as any
        const fotos = (r.repair_photos ?? []) as { photo_type: string; storage_path: string }[]
        const locatieLabel = [r.floor, r.room_or_unit, r.facade_side, r.component_type, r.element_number]
          .filter(Boolean).join(' · ') || 'Onbekende locatie'

        const prijs = Number(r.actual_sale_price ?? r.sale_price_snapshot ?? 0)
        const reparaties: RepRegel[] = [{
          id: r.id,
          naam: r.repair_name_snapshot ?? r.standard_repairs?.name ?? null,
          omschrijving: r.custom_work_description ?? r.damage_description ?? null,
          prijs,
        }]

        const rapport: RegRapport = {
          id: r.id,
          datum: r.registration_date ?? null,
          medewerker: r.profiles?.full_name ?? null,
          status: r.status,
          voorFoto: fotoUrl(fotos.find(f => f.photo_type === 'voor')?.storage_path),
          naFoto: fotoUrl(fotos.find(f => f.photo_type === 'na')?.storage_path),
          locatieLabel,
          reparaties,
        }

        const sleutel = (r.location_block as string | null) || 'Overig'
        const lijst = groepen.get(sleutel) ?? []
        lijst.push(rapport)
        groepen.set(sleutel, lijst)
      }

      setSecties([...groepen.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'nl'))
        .map(([naam, registraties]) => ({ naam, omschrijving: null, registraties })))
    }

    laad().catch(() => { /* rapportage blijft leeg bij laadfout */ })
    return () => { afgebroken = true }
  }, [projectId])

  if (!project) return null

  const alleRegistraties = secties.flatMap(s => s.registraties)
  const alleReparaties = alleRegistraties.flatMap(r => r.reparaties)
  const afgerond = alleRegistraties.filter(r => AFGEROND_STATUSSEN.includes(r.status)).length

  const aantalPerType = alleReparaties.reduce<Record<string, number>>((acc, r) => {
    const key = r.naam || r.omschrijving || 'Overig'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const typeLijst = Object.entries(aantalPerType).sort((a, b) => b[1] - a[1])

  const totaalPerType = alleReparaties.reduce<Record<string, { naam: string; aantal: number; prijs: number }>>(
    (acc, r) => {
      const key = r.naam || r.omschrijving || 'Overig'
      if (!acc[key]) acc[key] = { naam: key, aantal: 0, prijs: 0 }
      acc[key].aantal++
      acc[key].prijs += r.prijs || 0
      return acc
    }, {}
  )
  const totaalRegels = Object.values(totaalPerType).sort((a, b) => b.prijs - a.prijs)
  const totaalPrijs = alleReparaties.reduce((s, r) => s + (r.prijs || 0), 0)

  const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  async function downloadPdf() {
    if (!contentRef.current || !project) return
    setGenerating(true)
    const container = contentRef.current
    const prevW = container.style.width
    const prevMax = container.style.maxWidth

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])

      const A4_W = 210   // mm
      const A4_H = 297   // mm
      const MARGIN = 10  // mm (pagina-marge voor kaarten)
      const RENDER_W = 794 // px = A4 breedte bij 96dpi

      // Zet container vast op A4-breedte zodat tekst op schaal is
      container.style.width = `${RENDER_W}px`
      container.style.maxWidth = `${RENDER_W}px`
      await new Promise<void>(r => setTimeout(r, 200))

      const opts = {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: RENDER_W,
        imageTimeout: 8000,
      }

      // Hulpfunctie: canvas → hoogte in mm bij gegeven breedte
      const mmH = (canvas: HTMLCanvasElement, wMM = A4_W) =>
        (canvas.height / canvas.width) * wMM

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // ── Pagina 1: Voorblad ──────────────────────────────────────────────────
      const voorblad = container.querySelector<HTMLElement>('[data-pdf-voorblad]')!
      const vCanvas = await html2canvas(voorblad, opts)
      pdf.addImage(vCanvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, A4_W, mmH(vCanvas))

      // ── Pagina's: Reparatiekaarten (elk individueel captured) ──────────────
      const pdfItems = Array.from(
        container.querySelectorAll<HTMLElement>('[data-pdf-header], [data-pdf-card]')
      )

      if (pdfItems.length > 0) {
        pdf.addPage()
        let y = MARGIN
        let prevWasHeader = false

        for (const item of pdfItems) {
          const isHeader = item.hasAttribute('data-pdf-header')
          const canvas = await html2canvas(item, opts)
          const itemH = mmH(canvas)

          // Header: controleer of header + minimale kaarthoogte past
          // Kaart: controleer of kaart volledig past
          const minNodig = isHeader ? itemH + 35 : itemH

          if (y + minNodig > A4_H - MARGIN && y > MARGIN) {
            pdf.addPage()
            y = MARGIN
          }

          // Extra ruimte voor sectie-header (tenzij bovenaan pagina)
          if (isHeader && !prevWasHeader && y > MARGIN) {
            y += 4
          }

          pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, y, A4_W, itemH)
          y += itemH + (isHeader ? 1 : 3)
          prevWasHeader = isHeader
        }
      }

      // ── Laatste pagina: Totaalblad ─────────────────────────────────────────
      pdf.addPage()
      const totaal = container.querySelector<HTMLElement>('[data-pdf-totaalblad]')!
      const tCanvas = await html2canvas(totaal, opts)
      pdf.addImage(tCanvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, A4_W, mmH(tCanvas))

      pdf.save(`rapportage-${project.project_number}.pdf`)

    } catch (err) {
      console.error('PDF genereren mislukt:', err)
    } finally {
      container.style.width = prevW ?? ''
      container.style.maxWidth = prevMax ?? ''
      setGenerating(false)
    }
  }

  return (
    <>
      {/* Actie balk */}
      <div className="print:hidden flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            {metPrijzen ? 'Inclusief prijzen' : 'Exclusief prijzen'}
          </span>
          <button
            onClick={downloadPdf}
            disabled={generating}
            className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generating ? 'Genereren…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Rapportage inhoud – max 794px = A4-breedte bij 96dpi */}
      <div ref={contentRef} className="max-w-[794px] bg-white">

        {/* ══ DEEL 1: VOORBLAD ══════════════════════════════════════════════════ */}
        <div data-pdf-voorblad className="overflow-hidden">

          {/* Koptekst */}
          <div className="bg-everts-dark px-10 py-7 flex items-center justify-between">
            <img src="/logo-wit.svg" alt="Everts onderhoud & renovatie" className="h-9 w-auto" />
            <span className="text-white/70 text-sm font-medium">{datum}</span>
          </div>

          {/* Projecttitel */}
          <div className="px-10 pt-10 pb-8 border-b border-slate-100">
            <p className="text-[10px] font-bold text-everts uppercase tracking-widest mb-3">
              {metPrijzen ? 'Rapportage inclusief prijzen' : 'Rapportage'}
            </p>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{project.name}</h1>
            <p className="text-lg text-slate-500">{project.client_name}</p>
          </div>

          {/* Projectgegevens + Samenvatting */}
          <div className="px-10 py-8 grid grid-cols-2 gap-10">

            {/* Links: Projectgegevens */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">
                Projectgegevens
              </p>
              <dl className="space-y-3">
                <div className="flex gap-3">
                  <dt className="text-sm text-slate-400 w-32 flex-shrink-0">Projectnummer</dt>
                  <dd className="text-sm  font-bold text-slate-800">#{project.project_number}</dd>
                </div>
                {project.address && (
                  <div className="flex gap-3">
                    <dt className="text-sm text-slate-400 w-32 flex-shrink-0">Adres</dt>
                    <dd className="text-sm text-slate-700">
                      {project.address}<br />{project.postal_code} {project.city}
                    </dd>
                  </div>
                )}
                {project.start_date && (
                  <div className="flex gap-3">
                    <dt className="text-sm text-slate-400 w-32 flex-shrink-0">Startdatum</dt>
                    <dd className="text-sm text-slate-700">{formatDate(project.start_date)}</dd>
                  </div>
                )}
                {project.end_date && (
                  <div className="flex gap-3">
                    <dt className="text-sm text-slate-400 w-32 flex-shrink-0">Einddatum</dt>
                    <dd className="text-sm text-slate-700">{formatDate(project.end_date)}</dd>
                  </div>
                )}
                {project.contact_name && (
                  <div className="flex gap-3">
                    <dt className="text-sm text-slate-400 w-32 flex-shrink-0">Contactpersoon</dt>
                    <dd className="text-sm text-slate-700">
                      {project.contact_name}
                      {project.contact_phone && (
                        <><br /><span className="text-slate-500">{project.contact_phone}</span></>
                      )}
                      {project.contact_email && (
                        <><br /><span className="text-slate-500">{project.contact_email}</span></>
                      )}
                    </dd>
                  </div>
                )}
                {project.description && (
                  <div className="pt-4 mt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Omschrijving
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">{project.description}</p>
                  </div>
                )}
              </dl>
            </div>

            {/* Rechts: Samenvatting */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">
                Samenvatting
              </p>
              <div className="space-y-2 mb-6">
                <div className="bg-slate-50 rounded-lg px-4 py-3.5 flex items-center justify-between">
                  <span className="text-sm text-slate-500">Blokken</span>
                  <span className="text-xl font-bold text-slate-800">{secties.length}</span>
                </div>
                <div className="bg-slate-50 rounded-lg px-4 py-3.5 flex items-center justify-between">
                  <span className="text-sm text-slate-500">Totaal reparaties</span>
                  <span className="text-xl font-bold text-everts">{alleReparaties.length}</span>
                </div>
                <div className="bg-slate-50 rounded-lg px-4 py-3.5 flex items-center justify-between">
                  <span className="text-sm text-slate-500">Afgerond</span>
                  <span className="text-xl font-bold text-green-600">{afgerond}</span>
                </div>
                {metPrijzen && totaalPrijs > 0 && (
                  <div className="bg-everts-dark rounded-lg px-4 py-3.5 flex items-center justify-between">
                    <span className="text-sm text-white/80">Totaal verkoopwaarde</span>
                    <span className="text-xl font-bold text-white">{formatCurrency(totaalPrijs)}</span>
                  </div>
                )}
              </div>

              {typeLijst.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Reparaties per type
                  </p>
                  <div className="divide-y divide-slate-100">
                    {typeLijst.map(([naam, aantal]) => (
                      <div key={naam} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-slate-600 truncate pr-4">{naam}</span>
                        <span className="font-bold text-slate-800 flex-shrink-0 tabular-nums">{aantal}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Voorbladvoettekst */}
          <div className="px-10 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Everts Groep — onderhoud &amp; renovatie</span>
            <span>{datum}</span>
          </div>
        </div>

        {/* ══ DEEL 2: REPARATIEKAARTEN ═════════════════════════════════════════ */}
        {secties.map((sectie, si) => {
          if (sectie.registraties.length === 0) return null

          return (
            <div key={sectie.naam}>

              {/* Sectie-header: donkere balk — eigen PDF-element */}
              <div
                data-pdf-header
                className="px-8 py-5 bg-everts-dark flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {si + 1}
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base leading-tight">
                      {sectie.naam}
                    </h2>
                    {sectie.omschrijving && (
                      <p className="text-xs text-white/60 mt-0.5">{sectie.omschrijving}</p>
                    )}
                  </div>
                </div>
                <img src="/logo-wit.svg" alt="Everts" className="h-6 w-auto opacity-50" />
              </div>

              {/* Registratiekaarten: één kaart per registratie */}
              {sectie.registraties.map(reg => {
                const regDatum = reg.datum
                  ? new Date(reg.datum).toLocaleDateString('nl-NL', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })
                  : '—'
                const isAf = AFGEROND_STATUSSEN.includes(reg.status)
                const isBezig = reg.status === 'in_uitvoering' || reg.status === 'ingepland'

                return (
                  <div
                    key={reg.id}
                    data-pdf-card
                    className="px-6 pt-5 bg-white"
                  >
                    <div className="border border-slate-200 rounded-xl overflow-hidden">

                      {/* Kaart kop */}
                      <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm leading-snug">
                            {reg.locatieLabel}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            <span>{regDatum}</span>
                            {reg.medewerker && <span>· {reg.medewerker}</span>}
                            <span>· {reg.reparaties.length} reparatie{reg.reparaties.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <span className={`flex-shrink-0 text-xs px-3 py-1 rounded-full font-semibold mt-0.5 ${
                          isAf
                            ? 'bg-green-100 text-green-700'
                            : isBezig
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {REGISTRATIE_STATUSSEN[reg.status as keyof typeof REGISTRATIE_STATUSSEN] ?? reg.status}
                        </span>
                      </div>

                      {/* Foto's van de registratie */}
                      <div className="p-5 flex gap-5 bg-white">
                        <FotoVak src={reg.voorFoto} label="Voor" />
                        <FotoVak src={reg.naFoto} label="Na" />
                      </div>

                      {/* Reparaties lijst */}
                      {reg.reparaties.length > 0 && (
                        <div className="px-5 pb-5 border-t border-slate-100">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-2">
                            Uitgevoerde reparaties
                          </p>
                          <div className="space-y-1.5">
                            {reg.reparaties.map(rep => (
                              <div key={rep.id} className="flex items-center justify-between text-xs gap-3">
                                <span className="text-slate-600 truncate">
                                  {rep.naam || rep.omschrijving}
                                  {rep.naam && rep.omschrijving && (
                                    <span className="text-slate-400"> — {rep.omschrijving}</span>
                                  )}
                                </span>
                                {rep.prijs > 0 && (
                                  <span className="flex-shrink-0 font-medium text-slate-500">
                                    {formatCurrency(rep.prijs)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Ruimte na laatste kaart */}
        <div className="h-6 bg-white" />

        {/* ══ DEEL 3: TOTAALBLAD ════════════════════════════════════════════════ */}
        <div data-pdf-totaalblad className="bg-white overflow-hidden">

          {/* Totaalblad header */}
          <div className="bg-everts-dark px-8 py-6 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white text-xl">Overzicht reparaties</h2>
              <p className="text-sm text-white/60 mt-0.5">{alleReparaties.length} reparaties in totaal</p>
            </div>
            <img src="/logo-wit.svg" alt="Everts" className="h-8 w-auto opacity-70" />
          </div>

          {/* Tabel */}
          <div className="p-8">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 text-sm font-semibold text-slate-600">Reparatietype</th>
                  <th className="text-center py-3 text-sm font-semibold text-slate-600 w-20">Aantal</th>
                  {metPrijzen && (
                    <th className="text-right py-3 text-sm font-semibold text-slate-600 w-32">Bedrag</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {totaalRegels.map(regel => (
                  <tr key={regel.naam} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 text-sm text-slate-700 font-medium">{regel.naam}</td>
                    <td className="py-3 text-sm text-center text-slate-600">{regel.aantal}</td>
                    {metPrijzen && (
                      <td className="py-3 text-sm text-right font-semibold text-slate-700">
                        {regel.prijs > 0 ? formatCurrency(regel.prijs) : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {metPrijzen && (
                <tfoot>
                  <tr className="border-t-2 border-slate-800">
                    <td className="pt-4 text-sm font-bold text-slate-800">Totaal</td>
                    <td className="pt-4 text-sm text-center font-bold text-slate-800">
                      {alleReparaties.length}
                    </td>
                    <td className="pt-4 text-right font-bold text-everts-dark text-base">
                      {formatCurrency(totaalPrijs)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>

            {metPrijzen && totaalPrijs > 0 && (
              <div className="mt-8 bg-everts-dark rounded-xl p-6 flex items-center justify-between">
                <span className="text-white/70 text-sm">Totaal verkoopwaarde excl. BTW</span>
                <span className="text-2xl font-bold text-white">{formatCurrency(totaalPrijs)}</span>
              </div>
            )}
          </div>

          {/* Totaalblad voettekst */}
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Everts Groep — onderhoud &amp; renovatie</span>
            <span>{datum}</span>
          </div>
        </div>

      </div>
    </>
  )
}
