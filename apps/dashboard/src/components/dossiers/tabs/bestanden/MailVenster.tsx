'use client'

/**
 * Leesvenster voor een Outlook-mail (.msg) uit het dossier.
 *
 * De server pakt het bestand uit tot afzender, ontvangers, body en bijlagen; hier
 * tonen we dat als een gewone mail. De body komt uit een extern bestand en is dus
 * niet te vertrouwen: hij gaat in een afgeschermd venster (geen scripts, geen eigen
 * herkomst) met een strikt laadbeleid. Afbeeldingen die van een server buiten de mail
 * komen — de klassieke trackingpixel — blijven geblokkeerd tot je erom vraagt.
 */

import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, Button } from '@/components/ui'
import { bestandUrl, formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'

type MailBijlage = { index: number; naam: string; grootte: number | null; inline: boolean }

type MailBericht = {
  onderwerp: string | null
  van: string | null
  aan: string[]
  cc: string[]
  datum: string | null
  bodyHtml: string | null
  bodyTekst: string | null
  bijlagen: MailBijlage[]
  heeftExterneAfbeeldingen: boolean
}

const dtf = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'full', timeStyle: 'short' })

function formatteerDatum(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : dtf.format(new Date(t))
}

/**
 * Bouwt de inhoud van het afgeschermde venster.
 *
 * De Content-Security-Policy is de echte beveiliging: `default-src 'none'` blokkeert
 * alles wat de mail zou willen laden. Alleen ingesloten afbeeldingen (data:) en
 * opmaak mogen erdoor; externe afbeeldingen pas na een klik.
 */
function bouwDocument(html: string, externToestaan: boolean): string {
  const imgSrc = externToestaan ? "data: https:" : 'data:'
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:;">
<base target="_blank">
<style>
  html,body{margin:0;padding:0}
  body{font:13.5px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#27272a;padding:2px 2px 12px;word-break:break-word}
  img{max-width:100%;height:auto}
  table{max-width:100%}
  pre.platte-tekst{margin:0;font:13.5px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:pre-wrap}
  blockquote{margin:0 0 0 12px;padding-left:12px;border-left:2px solid #e4e4e7;color:#52525b}
  a{color:#2563eb}
</style></head><body>${html}</body></html>`
}

function Regel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[12.5px]">
      <span className="w-[68px] shrink-0 text-neutral-400">{label}</span>
      <span className="min-w-0 flex-1 text-neutral-700">{children}</span>
    </div>
  )
}

export default function MailVenster({ rij, onClose }: { rij: BestandRij | null; onClose: () => void }) {
  const [bericht, setBericht] = useState<MailBericht | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [externToestaan, setExternToestaan] = useState(false)

  const query = rij?.bronQuery ?? null

  useEffect(() => {
    if (!query) return
    let afgebroken = false
    setBericht(null)
    setFout(null)
    setExternToestaan(false)

    fetch(`/api/dossier-bestand/mail?${query}`)
      .then(async res => {
        const body = await res.json().catch(() => null)
        if (afgebroken) return
        if (!res.ok) setFout(body?.fout ?? 'Deze mail kon niet gelezen worden.')
        else setBericht(body as MailBericht)
      })
      .catch(() => { if (!afgebroken) setFout('Deze mail kon niet opgehaald worden.') })

    return () => { afgebroken = true }
  }, [query])

  if (!rij) return null

  const datum = formatteerDatum(bericht?.datum ?? null)
  const bijlagen = (bericht?.bijlagen ?? []).filter(b => !b.inline)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="xl" className="max-h-[88vh]">
        <DialogHeader>
          <div className="min-w-0 pr-8">
            <DialogTitle className="truncate">{bericht?.onderwerp || rij.naam}</DialogTitle>
            <p className="mt-[3px] text-[12px] text-neutral-400">Outlook-bericht uit {rij.bron}</p>
          </div>
        </DialogHeader>

        <DialogBody className="pt-4">
          {fout ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
              {fout} Je kunt hem hieronder wel downloaden en in Outlook openen.
            </div>
          ) : !bericht ? (
            <p className="text-[13px] text-neutral-500">Mail openen…</p>
          ) : (
            <>
              <div className="space-y-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                <Regel label="Van">{bericht.van ?? '—'}</Regel>
                <Regel label="Aan">{bericht.aan.length ? bericht.aan.join('; ') : '—'}</Regel>
                {!!bericht.cc.length && <Regel label="Cc">{bericht.cc.join('; ')}</Regel>}
                {datum && <Regel label="Datum">{datum}</Regel>}
              </div>

              {!!bijlagen.length && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-neutral-400">
                    {bijlagen.length} bijlage{bijlagen.length === 1 ? '' : 'n'}
                  </span>
                  {bijlagen.map(b => (
                    <a
                      key={b.index}
                      href={`/api/dossier-bestand/mail?${rij.bronQuery}&bijlage=${b.index}`}
                      className="inline-flex max-w-[240px] items-center gap-1.5 rounded border border-neutral-200 bg-white px-2 py-1 text-[11.5px] text-neutral-700 hover:border-brand-300 hover:text-brand-700"
                    >
                      <span className="truncate">{b.naam}</span>
                      <span className="shrink-0 text-neutral-400">{formatteerGrootte(b.grootte)}</span>
                    </a>
                  ))}
                </div>
              )}

              {bericht.heeftExterneAfbeeldingen && !externToestaan && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11.5px] text-neutral-600">
                  <span>Afbeeldingen van buiten deze mail zijn geblokkeerd.</span>
                  <button onClick={() => setExternToestaan(true)} className="shrink-0 font-medium text-brand-600 hover:underline">
                    Toch tonen
                  </button>
                </div>
              )}

              <div className="mt-3 rounded-lg border border-neutral-200">
                {bericht.bodyHtml ? (
                  <iframe
                    title="Inhoud van het bericht"
                    // Geen allow-scripts en geen allow-same-origin: de mail kan niets
                    // uitvoeren en komt niet bij EVA-gegevens. De popup-rechten laten
                    // alleen een link die je zelf aanklikt in een nieuw tabblad openen —
                    // zonder scripts kan de mail dat niet uit zichzelf doen.
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={bouwDocument(bericht.bodyHtml, externToestaan)}
                    className="h-[46vh] w-full rounded-lg bg-white"
                  />
                ) : (
                  <p className="px-3 py-4 text-[13px] text-neutral-500">Dit bericht heeft geen inhoud.</p>
                )}
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter split>
          <a
            href={bestandUrl(rij, { download: true })}
            className="text-[12px] font-medium text-brand-600 hover:underline"
          >
            Bestand downloaden
          </a>
          <Button variant="secondary" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
