'use client'

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import {
  zoekSharePointMappen,
  koppelDossierMap,
  maakDossierMap,
  koppelDossierMapViaLink,
  type DossierSharePointData,
  type SharePointMap,
} from '@/lib/dossiers/sharepoint-bestanden'

type Tab = 'kiezen' | 'nieuw' | 'link'

const PAGINA = 50

export default function SharePointMapPicker({
  dossierId,
  open,
  onOpenChange,
  onGekoppeld,
  voorstelNaam,
  zoekterm,
}: {
  dossierId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onGekoppeld: (data: DossierSharePointData) => void
  /** Voorstel voor een nieuwe map: `{dossiernummer} - {titel}`. */
  voorstelNaam: string | null
  /** Startwaarde van het zoekveld — het dossiernummer, zodat de juiste map bovenaan staat. */
  zoekterm: string | null
}) {
  const [tab, setTab] = useState<Tab>('kiezen')
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, start] = useTransition()

  // Kiezen
  const [query, setQuery] = useState('')
  const [mappen, setMappen] = useState<SharePointMap[]>([])
  const [totaal, setTotaal] = useState(0)
  const [laden, setLaden] = useState(false)
  const [gekozen, setGekozen] = useState<string | null>(null)

  // Nieuwe map / link
  const [naam, setNaam] = useState('')
  const [link, setLink] = useState('')

  // Elke zoekopdracht krijgt een volgnummer: een traag antwoord van een oudere
  // toetsaanslag mag een nieuwer resultaat niet overschrijven.
  const zoekTeller = useRef(0)

  const zoek = useCallback(
    async (q: string, offset: number) => {
      const mijn = ++zoekTeller.current
      setLaden(true)
      const res = await zoekSharePointMappen(dossierId, q, offset, PAGINA)
      if (mijn !== zoekTeller.current) return
      setLaden(false)
      if (!res.ok) {
        setFout(res.fout ?? 'Kon de mappen niet ophalen.')
        return
      }
      setFout(null)
      setTotaal(res.totaal)
      setMappen((vorige) => (offset === 0 ? res.mappen : [...vorige, ...res.mappen]))
    },
    [dossierId],
  )

  // Bij openen: zoekveld vullen met het dossiernummer en meteen zoeken.
  useEffect(() => {
    if (!open) return
    setTab('kiezen')
    setFout(null)
    setGekozen(null)
    setNaam(voorstelNaam ?? '')
    setLink('')
    setQuery(zoekterm ?? '')
    void zoek(zoekterm ?? '', 0)
  }, [open, voorstelNaam, zoekterm, zoek])

  // Debounce op typen — de lijst wordt server-side uit een korte cache gefilterd.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void zoek(query, 0), 250)
    return () => clearTimeout(t)
    // `query` is bewust de enige trigger: bij openen zoekt het effect hierboven al.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const klaar = (data: DossierSharePointData) => {
    if (data.fout) {
      setFout(data.fout)
      return
    }
    onGekoppeld(data)
    onOpenChange(false)
  }

  const koppel = () => {
    if (!gekozen) return
    start(async () => klaar(await koppelDossierMap(dossierId, gekozen)))
  }
  const maak = () => {
    if (!naam.trim()) return
    start(async () => klaar(await maakDossierMap(dossierId, naam.trim())))
  }
  const viaLink = () => {
    if (!link.trim()) return
    start(async () => klaar(await koppelDossierMapViaLink(dossierId, link.trim())))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div>
            <DialogTitle>SharePoint-map koppelen</DialogTitle>
            <DialogDescription>
              Kies de dossiermap in de bibliotheek, of maak hem aan als hij nog niet bestaat.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex gap-1 border-b border-neutral-200 px-6 pt-4">
          {([
            ['kiezen', 'Map kiezen'],
            ['nieuw', 'Nieuwe map'],
            ['link', 'Via link'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setTab(k); setFout(null) }}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                tab === k
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <DialogBody>
          {fout && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-700 break-words">
              {fout}
            </p>
          )}

          {tab === 'kiezen' && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op dossiernummer of adres…"
                className="mb-3 w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />

              {laden && mappen.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-neutral-500">Mappen laden…</p>
              ) : mappen.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[13px] text-neutral-500">Geen map gevonden voor “{query}”.</p>
                  <button
                    onClick={() => { setTab('nieuw'); setFout(null) }}
                    className="mt-1 text-[12px] font-medium text-brand-600 hover:underline"
                  >
                    Map aanmaken
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
                  {mappen.map((m) => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                        <input
                          type="radio"
                          name="sp-map"
                          checked={gekozen === m.id}
                          onChange={() => setGekozen(m.id)}
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-neutral-800">{m.naam}</span>
                          <span className="block text-[11px] text-neutral-500">
                            {m.aantalItems ?? 0} item{m.aantalItems === 1 ? '' : 's'}
                            {m.gewijzigd ? ` · gewijzigd ${m.gewijzigd}` : ''}
                          </span>
                        </span>
                        {m.webUrl && (
                          <a
                            href={m.webUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 text-[11px] font-medium text-brand-600 hover:underline"
                          >
                            Openen
                          </a>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {totaal > mappen.length && (
                <div className="mt-2 text-center">
                  <Button variant="ghost" size="sm" disabled={laden} onClick={() => void zoek(query, mappen.length)}>
                    Meer laden ({mappen.length} van {totaal})
                  </Button>
                </div>
              )}
            </>
          )}

          {tab === 'nieuw' && (
            <>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">Mapnaam</label>
              <input
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="20267.00600 - Straatnaam 1, Plaats"
                className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <p className="mt-2 text-[11.5px] text-neutral-500">
                De map komt in de ingestelde dossierbibliotheek. Begin de naam met het dossiernummer — daar
                herkent EVA de map later zelf aan terug.
              </p>
            </>
          )}

          {tab === 'link' && (
            <>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">SharePoint-link naar de map</label>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://evertsgroep.sharepoint.com/sites/…"
                className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <p className="mt-2 text-[11.5px] text-neutral-500">
                Plak een link naar de map zelf, niet naar een bestand erin. Lukt het niet, gebruik dan
                “Map kiezen”.
              </p>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bezig}>
            Annuleren
          </Button>
          {tab === 'kiezen' && (
            <Button onClick={koppel} disabled={bezig || !gekozen} loading={bezig}>
              Koppelen
            </Button>
          )}
          {tab === 'nieuw' && (
            <Button onClick={maak} disabled={bezig || !naam.trim()} loading={bezig}>
              Map aanmaken en koppelen
            </Button>
          )}
          {tab === 'link' && (
            <Button onClick={viaLink} disabled={bezig || !link.trim()} loading={bezig}>
              Koppelen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
