'use client'

/**
 * "Medewerker inplannen" op een servicedeskbon: één venster, één handeling.
 *
 * Hiervóór sprong de knop naar de detailplanning. Daar moest je dan alsnog het juiste bord, de
 * juiste week en de juiste rij zoeken voordat je kon doen waarvoor je klikte. Op een bon van een
 * halve dag is dat het grootste deel van het werk.
 *
 * Wat je invult is bewust weinig: wie, wanneer, hoe lang. De rest komt uit de bon — de
 * bewakingscode staat standaard op de code van de bon zelf, en de titel valt terug op de naam van
 * die code. De budgetbewaking en de spiegel naar Bouw7 lopen via `maakSnelPlanningItem`; hier
 * wordt daar niets van nagebouwd.
 *
 * De bezet-waarschuwing **blokkeert niet**. Twee korte klussen op één dag komen bewust voor, en
 * een venster dat strenger is dan de werkelijkheid helpt niemand. Je ziet wat er al staat en
 * beslist zelf.
 */

import React, { useEffect, useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { maakSnelPlanningItem, haalPlanningBewakingscodes } from '@/app/(platform)/planning/actions'
import { haalInplanGegevens, haalBezetStand, type BezetStand, type InplanGegevens } from '@/lib/planning/inplannen'

type Code = { code: string; naam: string | null; bouw7_security_code_id: number | null; in_gebruik: boolean }

export default function InplannenModal({
  dossierId, regieCode, onSluit, onKlaar,
}: {
  dossierId: string
  /** De opvangcode van de bon (RW01), als die er is: dat is hier vrijwel altijd de juiste keuze. */
  regieCode: string | null
  onSluit: () => void
  onKlaar: () => void
}) {
  const [bezig, start] = useTransition()
  const [gegevens, setGegevens] = useState<InplanGegevens | null>(null)
  const [codes, setCodes] = useState<Code[] | null>(null)
  const [bezet, setBezet] = useState<BezetStand | null>(null)
  const [overschrijding, setOverschrijding] = useState<string | null>(null)

  const vandaag = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    medewerker_id: '',
    bewakingscode: regieCode ?? '',
    uursoort_id: '',
    datum: vandaag,
    van: '07:00',
    tot: '16:00',
  })

  useEffect(() => {
    let actief = true
    haalInplanGegevens().then(g => { if (actief) setGegevens(g) }).catch(() => {})
    haalPlanningBewakingscodes(dossierId).then(r => {
      if (!actief || !r.ok) return
      // Alleen codes waar op deze bon iets aan hangt; een code die in Bouw7 bestaat maar nergens
      // in gebruik is, hoort niet in een snelinvoer.
      const bruikbaar = r.codes.filter(c => c.in_gebruik)
      setCodes(bruikbaar)
      // Geen voorkeurscode meegekregen en er is er maar één? Dan is die het.
      setForm(f => f.bewakingscode || bruikbaar.length !== 1 ? f : { ...f, bewakingscode: bruikbaar[0].code })
    }).catch(() => {})
    return () => { actief = false }
  }, [dossierId])

  const startDt = useMemo(() => tijdstip(form.datum, form.van), [form.datum, form.van])
  const eindDt = useMemo(() => tijdstip(form.datum, form.tot), [form.datum, form.tot])

  // Zodra wie-en-wanneer bekend is: kijken of die persoon dan al ergens staat. Met een kleine
  // vertraging, zodat typen in het tijdveld niet elke toetsaanslag een ronde naar de server is.
  useEffect(() => {
    if (!form.medewerker_id || !startDt || !eindDt) { setBezet(null); return }
    let actief = true
    const t = setTimeout(() => {
      haalBezetStand({ medewerkerId: form.medewerker_id, startDt, eindDt, dossierId })
        .then(s => { if (actief) setBezet(s) })
        .catch(() => { if (actief) setBezet(null) })
    }, 350)
    return () => { actief = false; clearTimeout(t) }
  }, [form.medewerker_id, startDt, eindDt, dossierId])

  const uren = useMemo(() => {
    if (!startDt || !eindDt) return 0
    const u = (new Date(eindDt).getTime() - new Date(startDt).getTime()) / 3_600_000
    return Math.round(u * 100) / 100
  }, [startDt, eindDt])

  const gekozenCode = codes?.find(c => c.code === form.bewakingscode) ?? null

  function opslaan(e: React.FormEvent) {
    e.preventDefault()
    if (!form.medewerker_id) { toast.error('Kies wie je inplant.'); return }
    if (!form.bewakingscode) { toast.error('Kies een kostengroep — een planitem staat altijd op een kostengroep.'); return }
    if (uren <= 0) { toast.error('De eindtijd ligt vóór de starttijd.'); return }

    start(async () => {
      const r = await maakSnelPlanningItem({
        dossier_id: dossierId,
        medewerker_id: form.medewerker_id,
        bewakingscode: form.bewakingscode,
        bewakingscode_naam: gekozenCode?.naam ?? null,
        // Zonder dit id hangt het planitem in Bouw7 aan geen enkele code en belandt het daar
        // ongecodeerd — zichtbaar, maar niet te bewaken.
        bouw7_security_code_id: gekozenCode?.bouw7_security_code_id ?? null,
        uursoort_id: form.uursoort_id || null,
        start_dt: startDt,
        eind_dt: eindDt,
        uren,
        overrule: overschrijding != null, // tweede poging = bewust doorzetten
      })
      if (!r.ok) {
        if (r.overschrijding) { setOverschrijding(r.error); return }
        toast.error(r.error)
        return
      }
      toast.success('Ingepland')
      onKlaar()
      onSluit()
    })
  }

  const botsingen = (bezet?.redenen ?? []).filter(r => r.soort === 'afwezig' || !r.zelfdeBon)

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onClick={onSluit}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={opslaan}
        className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 shadow-lg
                   dark:border-neutral-700 dark:bg-neutral-900"
      >
        <h2 className="mb-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Medewerker inplannen
        </h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">Wie</span>
          <select
            value={form.medewerker_id}
            onChange={e => setForm(f => ({ ...f, medewerker_id: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm
                       dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="">— kies een medewerker —</option>
            {(gegevens?.medewerkers ?? []).map(m => (
              <option key={m.id} value={m.id}>{m.naam}{m.functie ? ` · ${m.functie}` : ''}</option>
            ))}
          </select>
        </label>

        <div className="mb-3 grid grid-cols-3 gap-3">
          <label>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">Datum</span>
            <input
              type="date" value={form.datum}
              onChange={e => setForm(f => ({ ...f, datum: e.target.value }))}
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm
                         dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">Van</span>
            <input
              type="time" value={form.van}
              onChange={e => setForm(f => ({ ...f, van: e.target.value }))}
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm
                         dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">Tot</span>
            <input
              type="time" value={form.tot}
              onChange={e => setForm(f => ({ ...f, tot: e.target.value }))}
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm
                         dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </label>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">Kostengroep</span>
            <select
              value={form.bewakingscode}
              onChange={e => setForm(f => ({ ...f, bewakingscode: e.target.value }))}
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm
                         dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">— kies —</option>
              {(codes ?? []).map(c => (
                <option key={c.code} value={c.code}>{c.code}{c.naam ? ` · ${c.naam}` : ''}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">Uursoort</span>
            <select
              value={form.uursoort_id}
              onChange={e => setForm(f => ({ ...f, uursoort_id: e.target.value }))}
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm
                         dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">— standaard —</option>
              {(gegevens?.uursoorten ?? []).map(u => (
                <option key={u.id} value={u.id}>{u.naam}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          {uren > 0 ? `${uren.toLocaleString('nl-NL')} uur` : 'De eindtijd ligt vóór de starttijd.'}
        </p>

        {botsingen.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3
                          dark:border-amber-700/60 dark:bg-amber-950/40">
            <p className="mb-1 text-sm font-semibold text-amber-900 dark:text-amber-200">
              Deze medewerker staat op dat moment al ergens
            </p>
            <ul className="space-y-0.5 text-xs text-amber-900/90 dark:text-amber-200/90">
              {botsingen.map((r, i) => (
                <li key={i}>
                  {r.omschrijving}
                  {r.soort === 'planitem' ? ` (${klok(r.van)}–${klok(r.tot)})` : ` (${r.van} t/m ${r.tot})`}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-amber-900/80 dark:text-amber-200/80">
              Je kunt gewoon doorgaan — dit is een waarschuwing, geen blokkade.
            </p>
          </div>
        )}

        {overschrijding && (
          <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800
                          dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-200">
            {overschrijding} Klik nogmaals op Inplannen om het tóch te doen.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button type="submit" variant="primary" loading={bezig} disabled={bezig}>
            {overschrijding ? 'Toch inplannen' : 'Inplannen'}
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Lokale datum + tijd naar een ISO-tijdstip; leeg als een van beide ontbreekt. */
function tijdstip(datum: string, tijd: string): string {
  if (!datum || !tijd) return ''
  const d = new Date(`${datum}T${tijd}`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Alleen het uur uit een ISO-tijdstip, in lokale tijd. */
function klok(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
