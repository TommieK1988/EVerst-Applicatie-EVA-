'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, Input, Badge } from '@/components/ui'
import {
  opleverMomentStatusLabels, opleverMomentTypeLabels, opleverPuntStatusLabels,
  type OpleverMomentStatus, type OpleverMomentType, type OpleverPuntStatus, type OpleverToewijzingType,
} from '@everts/database'
import {
  getDossierOplevering, getOpleverToewijsbaar,
  maakOplevermoment, setMomentStatus, verwijderOplevermoment,
  maakOpleverpunt, updateOpleverpunt, setPuntStatus, verwijderOpleverpunt,
  markeerAlsExtraWerk, ontkoppelExtraWerk,
  uploadOpleverFoto, verwijderOpleverFoto, voegPuntReactieToe, maakToegangToken, voegHandtekeningToe,
  getOpleverFeedbackTemplates, getOpleverFeedbackSamenvatting, getOpleverFeedbackInzendingen,
  getOpleverTokenLinks, verwijderToegangToken,
  type DossierOpleveringData, type OpleverMomentView, type OpleverPuntView, type OpleverToewijsbaar,
  type OpleverFeedbackSamenvatting, type FeedbackInzending, type OpleverTokenLink,
} from '@/lib/dossiers/oplevering'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import HandtekeningPad from '@/components/planning/werkbon/HandtekeningPad'

const selectCls =
  'h-8 rounded-md border border-neutral-300 bg-white px-2 text-[12px] text-neutral-800 outline-none focus:border-brand-500'

const PUNT_TONE: Record<OpleverPuntStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  nieuw: 'warning', open: 'neutral', in_behandeling: 'info', opgelost: 'warning',
  geaccepteerd: 'success', geweigerd: 'error', afgewezen: 'neutral',
}

/** Statussen die alleen via triage worden gezet en dus niet in de handmatige status-select horen. */
const TRIAGE_STATUSSEN: OpleverPuntStatus[] = ['nieuw', 'afgewezen']

const LEGE_OPLEVERING: DossierOpleveringData = { momenten: [], triage: [], lossePunten: [], afgewezen: [] }
const MOMENT_TONE: Record<OpleverMomentStatus, 'neutral' | 'info' | 'warning' | 'success' | 'brand'> = {
  concept: 'neutral', in_uitvoering: 'info', gereed_voor_ondertekening: 'warning', ondertekend: 'brand', afgerond: 'success',
}

export default function OpleveringTab({ dossierId }: { dossierId: string }) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [data, setData] = useState<DossierOpleveringData | null>(null)
  const [toewijsbaar, setToewijsbaar] = useState<OpleverToewijsbaar | null>(null)
  const [bezig, setBezig] = useState(false)
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [nieuwTitel, setNieuwTitel] = useState('')
  const [nieuwType, setNieuwType] = useState<OpleverMomentType>('eindoplevering')

  function herlaad() {
    getDossierOplevering(dossierId).then(setData).catch(() => setData(LEGE_OPLEVERING))
  }
  useEffect(() => {
    herlaad()
    getOpleverToewijsbaar().then(setToewijsbaar).catch(() => setToewijsbaar({ medewerkers: [], relaties: [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId])

  async function voegMomentToe() {
    if (!nieuwTitel.trim()) { toast.error('Geef een titel op.'); return }
    setBezig(true)
    const r = await maakOplevermoment(dossierId, { titel: nieuwTitel.trim(), type: nieuwType })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Oplevermoment aangemaakt')
    setNieuwTitel(''); setNieuwType('eindoplevering'); setNieuwOpen(false); herlaad()
  }

  if (data == null) return <div className="px-8 py-7 text-[13px] text-neutral-500">Oplevering laden…</div>

  return (
    <div className="px-6 py-6 space-y-5 sm:px-8 sm:py-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[19px] font-bold text-neutral-900 leading-tight">Oplevering</h1>
          <p className="text-[12.5px] text-neutral-500">Opleverpunten, afmelden, ondertekenen en rapporteren.</p>
        </div>
        {!readOnly && (
          <Button variant="primary" onClick={() => setNieuwOpen(o => !o)} disabled={bezig}>
            {nieuwOpen ? 'Annuleren' : 'Nieuw oplevermoment'}
          </Button>
        )}
      </div>

      <UitlegBlok />

      {nieuwOpen && (
        <Card>
          <CardBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-[12px] font-medium text-neutral-700 sm:col-span-2">
                Titel
                <Input value={nieuwTitel} onChange={e => setNieuwTitel(e.target.value)} placeholder="Bijv. Eindoplevering blok A" />
              </label>
              <label className="text-[12px] font-medium text-neutral-700">
                Type
                <select className={`${selectCls} mt-1 w-full`} value={nieuwType}
                  onChange={e => setNieuwType(e.target.value as OpleverMomentType)}>
                  {(Object.keys(opleverMomentTypeLabels) as OpleverMomentType[]).map(t => (
                    <option key={t} value={t}>{opleverMomentTypeLabels[t]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="primary" onClick={voegMomentToe} disabled={bezig}>Aanmaken</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {data.triage.length > 0 && (
        <TriageBlok punten={data.triage} readOnly={readOnly} onChange={() => { herlaad(); router.refresh() }} />
      )}

      {data.momenten.length === 0 && data.lossePunten.length === 0 ? (
        <Card><CardBody>
          <p className="text-[13px] text-neutral-500">Nog geen oplevermoment op dit dossier. Maak er een aan om opleverpunten vast te leggen.</p>
        </CardBody></Card>
      ) : (
        data.momenten.map(m => (
          <MomentCard key={m.id} moment={m} dossierId={dossierId} toewijsbaar={toewijsbaar}
            readOnly={readOnly} onChange={() => { herlaad(); router.refresh() }} />
        ))
      )}

      {data.lossePunten.length > 0 && (
        <LossePuntenCard punten={data.lossePunten} dossierId={dossierId} toewijsbaar={toewijsbaar}
          readOnly={readOnly} onChange={() => { herlaad(); router.refresh() }} />
      )}

      {data.afgewezen.length > 0 && (
        <AfgewezenBlok punten={data.afgewezen} readOnly={readOnly} onChange={() => { herlaad(); router.refresh() }} />
      )}

      <FeedbackBlok dossierId={dossierId} readOnly={readOnly} />
    </div>
  )
}

/* ─────────────────────────────── Uitleg ──────────────────────────────────── */

function UitlegBlok() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/60">
      <button onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-800">
          <span aria-hidden>ℹ️</span> Hoe werkt de oplevering? {!open && <span className="font-normal text-brand-600">— klik voor uitleg</span>}
        </span>
        <span className="text-[11px] font-medium text-brand-600">{open ? 'Verbergen' : 'Tonen'}</span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-brand-200 px-4 py-3 text-[12.5px] leading-relaxed text-neutral-700">
          <p>
            De oplevering is <strong>geen formulier</strong> — je bouwt hem hier op. Maak een <strong>oplevermoment</strong> aan
            (bijv. &ldquo;Eindoplevering blok A&rdquo;) en voeg daaronder <strong>opleverpunten</strong> (restpunten) toe.
            Zodra alle punten geaccepteerd zijn, kun je laten ondertekenen.
          </p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li><strong>Op locatie + foto&rsquo;s:</strong> deze tab werkt op je telefoon. Bij &ldquo;Foto toevoegen&rdquo; opent direct de camera, en ondertekenen kan ter plekke op het scherm. Geen aparte app nodig.</li>
            <li><strong>Onderaannemers:</strong> wijs een punt aan een onderaannemer toe → er verschijnt een <em>afmeldlink</em> bij Deel-links. Stuur die link; hij ziet alleen zijn eigen punten en meldt ze af met foto — zonder EVA-account.</li>
            <li><strong>Opdrachtgever:</strong> laat ter plekke tekenen, of deel de <em>akkoordlink</em> voor akkoord op afstand.</li>
            <li><strong>Bewonersfeedback (optioneel):</strong> maak in de Formulieren-module één feedbackformulier (categorie &ldquo;Oplevering&rdquo;), en deel hieronder de feedback-link. Reacties worden bewaard en samengevat (gemiddelde per cijfer).</li>
            <li><strong>Aandachtspunten:</strong> zet in zo&rsquo;n formulier de vraag &ldquo;Aandachtspunt(en)&rdquo; en de invuller — bewoner of collega — kan melden wat er nog niet in orde is, met foto. Die meldingen komen bovenaan onder <em>Nieuwe meldingen</em>. Je zet ze met één klik op de opleverlijst of wijst ze af; pas dán zijn het echte opleverpunten.</li>
          </ul>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── Feedback-ronde (bewoners) ────────────────────── */

function datumTijd(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Toont een tokenlink als leesbare, selecteerbare tekst met kopieerknop. */
function LinkRegel({ link, readOnly, onIngetrokken }: {
  link: OpleverTokenLink
  readOnly: boolean
  onIngetrokken: () => void
}) {
  const [bezig, setBezig] = useState(false)

  async function kopieer() {
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success('Link gekopieerd')
    } catch {
      // Clipboard kan geweigerd zijn (geen https / geen toestemming). De link staat in beeld,
      // dus handmatig selecteren blijft mogelijk — geen valse succesmelding tonen.
      toast.error('Kopiëren geweigerd door de browser — selecteer de link hieronder handmatig.')
    }
  }
  async function trekIn() {
    if (!window.confirm('Deze link intrekken? Wie hem al heeft, kan het formulier daarna niet meer invullen.')) return
    setBezig(true)
    const r = await verwijderToegangToken(link.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Link ingetrokken'); onIngetrokken()
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-neutral-500">
          {link.templateNaam ?? 'Vragenlijst'} · aangemaakt {datumTijd(link.createdAt)}
          {link.verlooptOp && (
            <span className={link.verlopen ? 'ml-1 font-semibold text-red-600' : 'ml-1'}>
              · {link.verlopen ? 'verlopen' : `geldig t/m ${datumTijd(link.verlooptOp)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={kopieer}>Kopiëren</Button>
          {!readOnly && (
            <button type="button" onClick={trekIn} disabled={bezig}
              className="text-[11px] font-medium text-neutral-400 underline hover:text-red-600">
              Intrekken
            </button>
          )}
        </div>
      </div>
      <input
        readOnly
        value={link.url}
        onFocus={e => e.currentTarget.select()}
        className="mt-2 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[11.5px] text-neutral-700 outline-none focus:border-brand-500"
      />
    </div>
  )
}

/** Eén ingezonden formulier, uitklapbaar naar álle ingevulde velden. */
function InzendingRij({ inzending }: { inzending: FeedbackInzending }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-neutral-200">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-50">
        <div>
          <div className="text-[12.5px] font-semibold text-neutral-800">{inzending.templateNaam}</div>
          <div className="text-[11px] text-neutral-500">
            Ingediend {datumTijd(inzending.ingediendOp ?? inzending.aangemaaktOp)} · {inzending.antwoorden.length} veld(en)
          </div>
        </div>
        <span className="text-[11px] font-medium text-neutral-400">{open ? 'Inklappen ▲' : 'Bekijken ▼'}</span>
      </button>

      {open && (
        <div className="border-t border-neutral-200 px-3 py-2">
          {inzending.antwoorden.length === 0 ? (
            <p className="py-1 text-[12px] text-neutral-400">Dit formulier heeft geen invulbare velden.</p>
          ) : (
            <dl className="divide-y divide-neutral-100">
              {inzending.antwoorden.map((a, i) => (
                <div key={i} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[180px_1fr] sm:gap-3">
                  <dt className="text-[12px] font-medium text-neutral-600">{a.label}</dt>
                  <dd className="text-[12.5px] text-neutral-900">
                    {a.fotos.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {a.fotos.map((url, j) => (
                          <a key={j} href={url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`${a.label} ${j + 1}`}
                              className="h-16 w-16 rounded-md border border-neutral-200 object-cover" />
                          </a>
                        ))}
                      </div>
                    ) : a.waarde === 'Niet ingevuld' ? (
                      <span className="italic text-neutral-400">Niet ingevuld</span>
                    ) : (
                      <span className="whitespace-pre-wrap">{a.waarde}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-2 flex justify-end">
            <a href={`/formulieren/${inzending.templateId}/inzendingen/${inzending.id}`}
              target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-medium text-brand-600 underline">
              Openen in Formulieren (incl. PDF)
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function FeedbackBlok({ dossierId, readOnly }: { dossierId: string; readOnly: boolean }) {
  const [templates, setTemplates] = useState<{ id: string; naam: string }[] | null>(null)
  const [gekozen, setGekozen] = useState('')
  const [samenvatting, setSamenvatting] = useState<OpleverFeedbackSamenvatting | null>(null)
  const [inzendingen, setInzendingen] = useState<FeedbackInzending[] | null>(null)
  const [links, setLinks] = useState<OpleverTokenLink[] | null>(null)
  const [bezig, setBezig] = useState(false)

  function herlaadFeedback() {
    getOpleverFeedbackSamenvatting(dossierId).then(setSamenvatting).catch(() => setSamenvatting({ aantal: 0, cijfers: [] }))
    getOpleverFeedbackInzendingen(dossierId).then(setInzendingen).catch(() => setInzendingen([]))
    getOpleverTokenLinks(dossierId, 'feedback').then(setLinks).catch(() => setLinks([]))
  }
  useEffect(() => {
    getOpleverFeedbackTemplates().then(t => { setTemplates(t); if (t[0]) setGekozen(t[0].id) }).catch(() => setTemplates([]))
    herlaadFeedback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId])

  async function feedbackLink() {
    if (!gekozen) { toast.error('Kies eerst een vragenlijst.'); return }
    setBezig(true)
    const r = await maakToegangToken('feedback', { dossierId, formTemplateId: gekozen, geldigDagen: 60 })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    try {
      await navigator.clipboard.writeText(r.url)
      toast.success('Feedback-link gekopieerd — deel deze met bewoners/gebruikers')
    } catch {
      toast.success('Feedback-link aangemaakt — kopieer hem hieronder')
    }
    herlaadFeedback()
  }

  return (
    <Card>
      <CardHeader>Feedback-ronde bewoners</CardHeader>
      <CardBody>
        {samenvatting && samenvatting.aantal > 0 ? (
          <div className="mb-4">
            <div className="text-[12.5px] font-semibold text-neutral-700">{samenvatting.aantal} reactie(s) ontvangen</div>
            {samenvatting.cijfers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-3">
                {samenvatting.cijfers.map(c => (
                  <div key={c.label} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                    <div className="text-[11px] text-neutral-500">{c.label}</div>
                    <div className="text-[18px] font-bold tabular-nums text-neutral-900">
                      {c.gemiddelde.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      <span className="ml-1 text-[11px] font-medium text-neutral-400">gem. · {c.aantal}×</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mb-3 text-[13px] text-neutral-500">Nog geen feedback ontvangen.</p>
        )}

        {/* Ingevulde formulieren — alle velden, niet alleen de cijfers. */}
        {inzendingen && inzendingen.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-[12px] font-semibold text-neutral-700">Ingevulde formulieren</div>
            <div className="space-y-2">
              {inzendingen.map(i => <InzendingRij key={i.id} inzending={i} />)}
            </div>
          </div>
        )}

        {/* Actieve links — blijven zichtbaar zodat je ze later opnieuw kunt kopiëren. */}
        {links && links.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-[12px] font-semibold text-neutral-700">Actieve feedback-links</div>
            <div className="space-y-2">
              {links.map(l => (
                <LinkRegel key={l.id} link={l} readOnly={readOnly} onIngetrokken={herlaadFeedback} />
              ))}
            </div>
          </div>
        )}

        {!readOnly && (
          templates && templates.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectCls} value={gekozen} onChange={e => setGekozen(e.target.value)}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.naam}</option>)}
              </select>
              <Button variant="secondary" onClick={feedbackLink} disabled={bezig}>
                {links && links.length > 0 ? 'Extra feedback-link maken' : 'Feedback-link maken & kopiëren'}
              </Button>
            </div>
          ) : templates ? (
            <p className="text-[12px] text-neutral-400">
              Nog geen gepubliceerd feedbacksjabloon (categorie &ldquo;Oplevering&rdquo;). Maak er een aan onder Formulieren.
            </p>
          ) : (
            <p className="text-[12px] text-neutral-400">Sjablonen laden…</p>
          )
        )}
      </CardBody>
    </Card>
  )
}

/* ──────────────────── Triage: gemelde aandachtspunten ─────────────────────── */

/**
 * Meldingen uit een formulier komen niet meteen op de opleverlijst: een bewoner meldt via een
 * openbare link, en niet elke melding is werk. De projectleider zet ze hier op de lijst of wijst ze
 * af met een reden.
 *
 * Bewust geen `PuntRow`: die heeft een status-select, toewijzing en extra-werk-schakelaar die pas
 * betekenis krijgen zódra een melding een opleverpunt is.
 */
function TriageBlok({ punten, readOnly, onChange }: {
  punten: OpleverPuntView[]
  readOnly: boolean
  onChange: () => void
}) {
  const [bezig, setBezig] = useState<string | null>(null)

  async function beoordeel(punt: OpleverPuntView, status: 'open' | 'afgewezen') {
    let reden: string | null = null
    if (status === 'afgewezen') {
      reden = window.prompt('Waarom is dit geen opleverpunt? (optioneel)') ?? null
    }
    setBezig(punt.id)
    const r = await setPuntStatus(punt.id, status, { reden })
    setBezig(null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(status === 'open' ? 'Op de opleverlijst gezet' : 'Melding afgewezen')
    onChange()
  }

  return (
    <Card>
      <CardHeader>
        <span>Nieuwe meldingen</span>
        <Badge tone="warning" size="sm">{punten.length}</Badge>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-[12.5px] text-neutral-500">
          Gemeld via een formulier. Zet ze op de opleverlijst, of wijs ze af met een reden.
        </p>
        <div className="space-y-2">
          {punten.map(punt => (
            <div key={punt.id} className="rounded-lg border border-warning-200 bg-warning-50/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-neutral-800">{punt.omschrijving}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    {punt.ruimte && <span>{punt.ruimte} · </span>}
                    <span>{punt.bronTemplateNaam ?? 'Formulier'}</span>
                    <span> · {punt.melder_naam ?? 'Anoniem'}</span>
                    <span> · {datumTijd(punt.created_at)}</span>
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-2">
                    <Button variant="primary" onClick={() => beoordeel(punt, 'open')} disabled={bezig === punt.id}>
                      Op de lijst
                    </Button>
                    <button
                      className="text-[11px] font-medium text-error-600 hover:underline disabled:opacity-50"
                      disabled={bezig === punt.id}
                      onClick={() => beoordeel(punt, 'afgewezen')}
                    >
                      Afwijzen
                    </button>
                  </div>
                )}
              </div>

              {punt.fotos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {punt.fotos.map(f => (
                    <div key={f.id} className="h-16 w-16 overflow-hidden rounded-md border border-neutral-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <a href={f.url} target="_blank" rel="noreferrer">
                        <img src={f.url} alt="foto bij melding" className="h-full w-full object-cover" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

/* ──────────────── Punten zonder oplevermoment (aandachtspunten) ───────────── */

/** Punten die op de lijst staan maar niet aan een inspectie hangen — typisch gemelde meldingen. */
function LossePuntenCard({ punten, dossierId, toewijsbaar, readOnly, onChange }: {
  punten: OpleverPuntView[]
  dossierId: string
  toewijsbaar: OpleverToewijsbaar | null
  readOnly: boolean
  onChange: () => void
}) {
  const open = punten.filter(p => p.status !== 'geaccepteerd').length
  return (
    <Card>
      <CardHeader>
        <span>Aandachtspunten</span>
        <Badge tone={open > 0 ? 'warning' : 'success'} size="sm">{open} open</Badge>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-[12.5px] text-neutral-500">
          Punten op de opleverlijst die niet aan een oplevermoment hangen.
        </p>
        <div className="space-y-2">
          {punten.map(p => (
            <PuntRow key={p.id} punt={p} dossierId={dossierId} toewijsbaar={toewijsbaar}
              readOnly={readOnly} onChange={onChange} />
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

/** Afgewezen meldingen — ingeklapt, puur ter verantwoording. */
function AfgewezenBlok({ punten, readOnly, onChange }: {
  punten: OpleverPuntView[]
  readOnly: boolean
  onChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState<string | null>(null)

  async function terug(punt: OpleverPuntView) {
    setBezig(punt.id)
    const r = await setPuntStatus(punt.id, 'nieuw')
    setBezig(null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Terug bij de nieuwe meldingen'); onChange()
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/60">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="text-[12.5px] font-medium text-neutral-600">
          {punten.length} afgewezen melding{punten.length === 1 ? '' : 'en'}
        </span>
        <span className="text-[11px] font-medium text-neutral-500">{open ? 'Verbergen' : 'Tonen'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-neutral-200 px-4 py-3">
          {punten.map(p => (
            <div key={p.id} className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-neutral-600 line-through">{p.omschrijving}</div>
                {p.geweigerd_reden && (
                  <div className="text-[11px] text-neutral-500">Reden: {p.geweigerd_reden}</div>
                )}
              </div>
              {!readOnly && (
                <button className="text-[11px] text-neutral-500 hover:underline disabled:opacity-50"
                  disabled={bezig === p.id} onClick={() => terug(p)}>
                  Ongedaan maken
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────── Moment ──────────────────────────────────── */

function MomentCard({ moment, dossierId, toewijsbaar, readOnly, onChange }: {
  moment: OpleverMomentView
  dossierId: string
  toewijsbaar: OpleverToewijsbaar | null
  readOnly: boolean
  onChange: () => void
}) {
  const [bezig, setBezig] = useState(false)
  const [puntOpen, setPuntOpen] = useState(false)

  async function wijzigStatus(status: OpleverMomentStatus) {
    setBezig(true)
    const r = await setMomentStatus(moment.id, status)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    onChange()
  }
  async function verwijder() {
    if (!window.confirm(`Oplevermoment "${moment.titel}" en alle punten verwijderen?`)) return
    setBezig(true)
    const r = await verwijderOplevermoment(moment.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Verwijderd'); onChange()
  }

  const alleGeaccepteerd = moment.aantalTotaal > 0 && moment.aantalOpen === 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{moment.titel}</span>
            <Badge tone="neutral" size="sm">{opleverMomentTypeLabels[moment.type]}</Badge>
            <Badge tone={MOMENT_TONE[moment.status]} size="sm">{opleverMomentStatusLabels[moment.status]}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-neutral-500 tabular-nums">
              {moment.aantalGeaccepteerd}/{moment.aantalTotaal} geaccepteerd
              {moment.aantalOpen > 0 && <span className="ml-1 text-warning-700">· {moment.aantalOpen} open</span>}
            </span>
            {!readOnly && (
              <>
                <select className={selectCls} value={moment.status} disabled={bezig}
                  onChange={e => { if (e.target.value !== moment.status) wijzigStatus(e.target.value as OpleverMomentStatus) }}>
                  {(Object.keys(opleverMomentStatusLabels) as OpleverMomentStatus[]).map(s => (
                    <option key={s} value={s}>{opleverMomentStatusLabels[s]}</option>
                  ))}
                </select>
                <button className="text-[11px] font-medium text-error-600 hover:underline" disabled={bezig} onClick={verwijder}>
                  Verwijder
                </button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {alleGeaccepteerd && (
          <div className="mb-3 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-[12px] font-medium text-success-800">
            Alle opleverpunten geaccepteerd — gereed voor ondertekening.
          </div>
        )}

        {!readOnly && <DeelLinks moment={moment} dossierId={dossierId} />}

        <OndertekenBlok moment={moment} readOnly={readOnly} onChange={onChange} />

        {moment.punten.length === 0 ? (
          <p className="text-[13px] text-neutral-500">Nog geen opleverpunten.</p>
        ) : (
          <div className="space-y-2">
            {moment.punten.map(p => (
              <PuntRow key={p.id} punt={p} dossierId={dossierId} toewijsbaar={toewijsbaar}
                readOnly={readOnly} onChange={onChange} />
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="mt-3">
            {puntOpen ? (
              <NieuwPuntForm momentId={moment.id} toewijsbaar={toewijsbaar}
                onDone={() => { setPuntOpen(false); onChange() }} onCancel={() => setPuntOpen(false)} />
            ) : (
              <Button variant="secondary" onClick={() => setPuntOpen(true)}>+ Opleverpunt toevoegen</Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

/* ────────────────────────── Ondertekenen ter plekke ──────────────────────── */

function OndertekenBlok({ moment, readOnly, onChange }: {
  moment: OpleverMomentView
  readOnly: boolean
  onChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rol, setRol] = useState<'opdrachtgever' | 'opzichter' | 'uitvoerder'>('opdrachtgever')
  const [naam, setNaam] = useState('')
  const [b64, setB64] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function vastleggen() {
    if (!b64) { toast.error('Zet eerst een handtekening.'); return }
    setBezig(true)
    const r = await voegHandtekeningToe(moment.id, { rol, naam: naam.trim() || null, handtekening_b64: b64, methode: 'pad' })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Handtekening vastgelegd')
    setOpen(false); setNaam(''); setB64(null); onChange()
  }

  const ROL_LABEL: Record<string, string> = { opdrachtgever: 'Opdrachtgever', opzichter: 'Opzichter', uitvoerder: 'Uitvoerder' }

  return (
    <div className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Ondertekening</span>
        {!readOnly && (
          <button onClick={() => setOpen(o => !o)} className="text-[11px] font-medium text-brand-600 hover:underline">
            {open ? 'Sluiten' : 'Ter plekke ondertekenen'}
          </button>
        )}
      </div>

      {moment.handtekeningen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {moment.handtekeningen.map(h => (
            <div key={h.id} className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1">
              {h.handtekening_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={h.handtekening_url} alt="handtekening" className="h-8 w-20 object-contain" />
                : <span className="text-[11px] text-success-700">✓ Akkoord op afstand</span>}
              <div className="text-[10.5px] text-neutral-500">
                <div className="font-medium text-neutral-700">{ROL_LABEL[h.rol] ?? h.rol}</div>
                {h.naam && <div>{h.naam}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && !readOnly && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select className={selectCls} value={rol} onChange={e => setRol(e.target.value as typeof rol)}>
              <option value="opdrachtgever">Opdrachtgever</option>
              <option value="opzichter">Opzichter</option>
              <option value="uitvoerder">Uitvoerder</option>
            </select>
            <Input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Naam ondertekenaar" />
          </div>
          <div className="max-w-[380px]"><HandtekeningPad onChange={setB64} /></div>
          <Button variant="primary" onClick={vastleggen} disabled={bezig}>Handtekening vastleggen</Button>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── Deel-links (portaal) ────────────────────────── */

function DeelLinks({ moment, dossierId }: { moment: OpleverMomentView; dossierId: string }) {
  const [bezig, setBezig] = useState(false)

  // Distinct onderaannemers/leveranciers onder de punten van dit moment.
  const relaties = new Map<string, string>()
  for (const p of moment.punten) {
    if (p.toegewezen_type === 'relatie' && p.toegewezen_relatie_id) {
      relaties.set(p.toegewezen_relatie_id, p.toegewezenNaam ?? 'Partij')
    }
  }

  async function kopieer(url: string, label: string) {
    try { await navigator.clipboard.writeText(url) } catch { /* clipboard kan geweigerd worden */ }
    toast.success(`Link gekopieerd — ${label}`)
  }

  async function afmeldLink(relatieId: string, naam: string) {
    setBezig(true)
    const r = await maakToegangToken('onderaannemer', { dossierId, relatieId, geldigDagen: 30, omschrijving: naam })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    kopieer(r.url, naam)
  }

  async function akkoordLink() {
    setBezig(true)
    const r = await maakToegangToken('ondertekening', { dossierId, momentId: moment.id, geldigDagen: 30 })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    kopieer(r.url, 'akkoord opdrachtgever')
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Deel-links</span>
      <a href={`/api/oplevering/rapport/${moment.id}`} target="_blank" rel="noreferrer"
        className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:border-brand-400">
        📄 Rapportage (print/PDF)
      </a>
      {[...relaties.entries()].map(([id, naam]) => (
        <button key={id} disabled={bezig} onClick={() => afmeldLink(id, naam)}
          className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:border-brand-400">
          Afmeldlink: {naam}
        </button>
      ))}
      <button disabled={bezig} onClick={akkoordLink}
        className="rounded-full border border-brand-300 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:border-brand-500">
        Akkoordlink opdrachtgever
      </button>
      {relaties.size === 0 && (
        <span className="text-[11px] text-neutral-400">Wijs punten toe aan een onderaannemer om een afmeldlink te maken.</span>
      )}
    </div>
  )
}

/* ────────────────────────────── Nieuw punt ───────────────────────────────── */

function ToewijzingVelden({ type, medewerkerId, relatieId, toewijsbaar, onChange }: {
  type: OpleverToewijzingType | null
  medewerkerId: string | null
  relatieId: string | null
  toewijsbaar: OpleverToewijsbaar | null
  onChange: (v: { type: OpleverToewijzingType | null; medewerkerId: string | null; relatieId: string | null }) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls} value={type ?? ''}
        onChange={e => onChange({ type: (e.target.value || null) as OpleverToewijzingType | null, medewerkerId: null, relatieId: null })}>
        <option value="">Niet toegewezen</option>
        <option value="medewerker">Medewerker</option>
        <option value="relatie">Onderaannemer / leverancier</option>
      </select>
      {type === 'medewerker' && (
        <select className={selectCls} value={medewerkerId ?? ''}
          onChange={e => onChange({ type, medewerkerId: e.target.value || null, relatieId: null })}>
          <option value="">Kies medewerker…</option>
          {(toewijsbaar?.medewerkers ?? []).map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
        </select>
      )}
      {type === 'relatie' && (
        <select className={selectCls} value={relatieId ?? ''}
          onChange={e => onChange({ type, medewerkerId: null, relatieId: e.target.value || null })}>
          <option value="">Kies partij…</option>
          {(toewijsbaar?.relaties ?? []).map(r => (
            <option key={r.id} value={r.id}>{r.naam}{r.onderaannemer ? ' (OA)' : ''}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function NieuwPuntForm({ momentId, toewijsbaar, onDone, onCancel }: {
  momentId: string
  toewijsbaar: OpleverToewijsbaar | null
  onDone: () => void
  onCancel: () => void
}) {
  const [omschrijving, setOmschrijving] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [toew, setToew] = useState<{ type: OpleverToewijzingType | null; medewerkerId: string | null; relatieId: string | null }>({
    type: null, medewerkerId: null, relatieId: null,
  })
  const [deadline, setDeadline] = useState('')
  const [bezig, setBezig] = useState(false)

  async function opslaan() {
    if (!omschrijving.trim()) { toast.error('Geef een omschrijving op.'); return }
    setBezig(true)
    const r = await maakOpleverpunt(momentId, {
      omschrijving: omschrijving.trim(),
      ruimte: ruimte.trim() || null,
      toegewezen_type: toew.type,
      toegewezen_medewerker_id: toew.medewerkerId,
      toegewezen_relatie_id: toew.relatieId,
      deadline: deadline || null,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Opleverpunt toegevoegd'); onDone()
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
      <label className="block text-[12px] font-medium text-neutral-700">
        Omschrijving
        <textarea className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-brand-500"
          rows={2} value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Wat moet er nog gebeuren?" />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-medium text-neutral-700">
          Ruimte / locatie
          <Input value={ruimte} onChange={e => setRuimte(e.target.value)} placeholder="Bijv. hal, kozijn achtergevel" />
        </label>
        <label className="text-[12px] font-medium text-neutral-700">
          Deadline (optioneel)
          <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </label>
      </div>
      <div>
        <div className="mb-1 text-[12px] font-medium text-neutral-700">Toewijzen aan</div>
        <ToewijzingVelden type={toew.type} medewerkerId={toew.medewerkerId} relatieId={toew.relatieId}
          toewijsbaar={toewijsbaar} onChange={setToew} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={bezig}>Annuleren</Button>
        <Button variant="primary" onClick={opslaan} disabled={bezig}>Toevoegen</Button>
      </div>
    </div>
  )
}

/* ──────────────────────────────── Punt-rij ───────────────────────────────── */

function PuntRow({ punt, dossierId, toewijsbaar, readOnly, onChange }: {
  punt: OpleverPuntView
  dossierId: string
  toewijsbaar: OpleverToewijsbaar | null
  readOnly: boolean
  onChange: () => void
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function wijzigStatus(status: OpleverPuntStatus) {
    let reden: string | null = null
    if (status === 'geweigerd') reden = window.prompt('Reden van afwijzing (optioneel):') ?? null
    setBezig(true)
    const r = await setPuntStatus(punt.id, status, { reden })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    onChange()
  }

  async function wijzigToewijzing(v: { type: OpleverToewijzingType | null; medewerkerId: string | null; relatieId: string | null }) {
    setBezig(true)
    const r = await updateOpleverpunt(punt.id, {
      toegewezen_type: v.type, toegewezen_medewerker_id: v.medewerkerId, toegewezen_relatie_id: v.relatieId,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    onChange()
  }

  async function toggleExtraWerk() {
    setBezig(true)
    const r = punt.is_extra_werk ? await ontkoppelExtraWerk(punt.id) : await markeerAlsExtraWerk(punt.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(punt.is_extra_werk ? 'Extra werk ontkoppeld' : 'Als extra werk gemarkeerd (meerwerkregel aangemaakt)')
    onChange(); router.refresh()
  }

  async function uploadFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setBezig(true)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('foto', file)
      const r = await uploadOpleverFoto(punt.id, fd)
      if (!r.ok) { toast.error(r.error); break }
    }
    setBezig(false)
    onChange()
  }

  async function verwijderFoto(id: string) {
    setBezig(true)
    const r = await verwijderOpleverFoto(id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    onChange()
  }

  async function verwijder() {
    if (!window.confirm('Opleverpunt verwijderen?')) return
    setBezig(true)
    const r = await verwijderOpleverpunt(punt.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Verwijderd'); onChange()
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Losse punten (AP) hebben een eigen nummerreeks per dossier, naast die per moment (OP). */}
            <span className="text-[11px] font-semibold tabular-nums text-neutral-400">
              {punt.moment_id ? 'OP' : 'AP'}{String(punt.volgnummer).padStart(2, '0')}
            </span>
            <Badge tone={PUNT_TONE[punt.status]} size="sm">{opleverPuntStatusLabels[punt.status]}</Badge>
            {punt.is_extra_werk && (
              <Badge tone="brand" size="sm">Extra werk{punt.meerwerkVolgnummer ? ` · MW${String(punt.meerwerkVolgnummer).padStart(2, '0')}` : ''}</Badge>
            )}
          </div>
          <div className="mt-1 text-[13px] text-neutral-800">{punt.omschrijving}</div>
          <div className="mt-0.5 text-[11px] text-neutral-500">
            {punt.ruimte && <span>{punt.ruimte}</span>}
            {punt.ruimte && punt.toegewezenNaam && <span className="mx-1">·</span>}
            {punt.toegewezenNaam && <span>→ {punt.toegewezenNaam}</span>}
            {punt.deadline && <span className="ml-1 text-warning-700">· deadline {punt.deadline}</span>}
          </div>
          {punt.status === 'geweigerd' && punt.geweigerd_reden && (
            <div className="mt-1 text-[11px] text-error-600">Afgewezen: {punt.geweigerd_reden}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {punt.fotos.length > 0 && (
            <button className="text-[11px] text-neutral-500 hover:underline" onClick={() => setOpen(o => !o)}>
              {punt.fotos.length} foto{punt.fotos.length > 1 ? '’s' : ''}
            </button>
          )}
          {!readOnly && (
            <select className={selectCls} value={punt.status} disabled={bezig}
              onChange={e => { if (e.target.value !== punt.status) wijzigStatus(e.target.value as OpleverPuntStatus) }}>
              {/* Triage-statussen horen hier niet: die zet je bij "Nieuwe meldingen", niet halverwege het werk. */}
              {(Object.keys(opleverPuntStatusLabels) as OpleverPuntStatus[])
                .filter(s => !TRIAGE_STATUSSEN.includes(s))
                .map(s => (
                  <option key={s} value={s}>{opleverPuntStatusLabels[s]}</option>
                ))}
            </select>
          )}
          <button className="text-[11px] text-neutral-500 hover:underline" onClick={() => setOpen(o => !o)}>
            {open ? 'Sluiten' : 'Details'}
          </button>
        </div>
      </div>

      {/* Foto-thumbnails */}
      {punt.fotos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {punt.fotos.map(f => (
            <div key={f.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={f.url} target="_blank" rel="noreferrer">
                <img src={f.url} alt="opleverfoto" className="h-full w-full object-cover" />
              </a>
              {!readOnly && (
                <button onClick={() => verwijderFoto(f.id)}
                  className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/50 text-[10px] text-white">×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="mb-1 text-[11px] font-medium text-neutral-600">Toewijzing</div>
                <ToewijzingVelden
                  type={punt.toegewezen_type} medewerkerId={punt.toegewezen_medewerker_id} relatieId={punt.toegewezen_relatie_id}
                  toewijsbaar={toewijsbaar} onChange={wijzigToewijzing} />
              </div>
              <label className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-700">
                <input type="checkbox" checked={punt.is_extra_werk} disabled={bezig} onChange={toggleExtraWerk} />
                Extra werk
              </label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
                onChange={e => uploadFotos(e.target.files)} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={bezig}>Foto toevoegen</Button>
              <button className="text-[11px] font-medium text-error-600 hover:underline" disabled={bezig} onClick={verwijder}>
                Verwijder punt
              </button>
            </div>
          )}
          <ReactieBlok punt={punt} readOnly={readOnly} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────── Reacties ────────────────────────────────── */

function ReactieBlok({ punt, readOnly, onChange }: { punt: OpleverPuntView; readOnly: boolean; onChange: () => void }) {
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)

  async function plaats() {
    if (!tekst.trim()) return
    setBezig(true)
    const r = await voegPuntReactieToe(punt.id, { opmerking: tekst.trim(), soort: 'opmerking' })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    setTekst(''); onChange()
  }

  return (
    <div>
      {punt.reacties.length > 0 && (
        <div className="space-y-1.5">
          {punt.reacties.map(r => (
            <div key={r.id} className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-neutral-700">{r.auteur_naam ?? (r.auteur_type === 'onderaannemer' ? 'Onderaannemer' : 'Intern')}</span>
                {r.soort === 'afmelding' && <Badge tone="warning" size="sm">Afmelding</Badge>}
                <span className="text-[10.5px] text-neutral-400">{new Date(r.created_at).toLocaleDateString('nl-NL')}</span>
              </div>
              {r.opmerking && <div className="text-neutral-700">{r.opmerking}</div>}
              {r.foto_urls.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.foto_urls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer" className="h-12 w-12 overflow-hidden rounded border border-neutral-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="reactiefoto" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="mt-2 flex items-center gap-2">
          <Input value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Opmerking toevoegen…"
            onKeyDown={e => { if (e.key === 'Enter') plaats() }} />
          <Button variant="secondary" onClick={plaats} disabled={bezig}>Plaats</Button>
        </div>
      )}
    </div>
  )
}
