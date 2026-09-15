'use client'

/**
 * Leesvenster voor een markdown-bestand (.md) uit het dossier.
 *
 * De server maakt er opgemaakte HTML van; hier tonen we dat als een gewoon document.
 * Net als bij een mail komt die inhoud uit een extern bestand en gaat hij daarom in
 * een afgeschermd venster: geen scripts, geen eigen herkomst, en een strikt
 * laadbeleid. Alleen de opmaak en de afbeeldingen waar het document zelf naar
 * verwijst mogen erdoor.
 */

import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, Button } from '@/components/ui'
import { bestandUrl, type BestandRij } from '@/lib/dossiers/bestand-rijen'

type MarkdownDocument = {
  titel: string | null
  html: string
  tekens: number
}

/**
 * Bouwt de inhoud van het afgeschermde venster.
 *
 * De Content-Security-Policy is de echte beveiliging: `default-src 'none'` blokkeert
 * alles wat het document zou willen laden. Afbeeldingen mogen wel — anders mist een
 * document met schermafdrukken zijn halve inhoud, en anders dan bij binnenkomende
 * mail zijn dit stukken die collega's zelf in het dossier hebben gezet.
 */
function bouwDocument(html: string): string {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:;">
<base target="_blank">
<style>
  html,body{margin:0;padding:0}
  body{font:13.5px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#27272a;padding:4px 14px 20px;word-break:break-word}
  h1,h2,h3,h4,h5,h6{margin:1.4em 0 .5em;line-height:1.3;font-weight:600;color:#18181b}
  h1{font-size:20px;margin-top:.4em}
  h2{font-size:17px;padding-bottom:.25em;border-bottom:1px solid #e4e4e7}
  h3{font-size:15px}
  h4,h5,h6{font-size:13.5px}
  p{margin:0 0 .85em}
  ul,ol{margin:0 0 .85em;padding-left:1.4em}
  li{margin:.2em 0}
  li>ul,li>ol{margin-bottom:.2em}
  a{color:#2563eb}
  img{max-width:100%;height:auto}
  hr{border:0;border-top:1px solid #e4e4e7;margin:1.6em 0}
  blockquote{margin:0 0 .85em;padding:.1em 0 .1em 12px;border-left:3px solid #e4e4e7;color:#52525b}
  code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f4f4f5;border-radius:3px;padding:.12em .35em}
  pre{background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;padding:10px 12px;overflow-x:auto;margin:0 0 .85em}
  pre code{background:none;padding:0}
  table{border-collapse:collapse;margin:0 0 .95em;font-size:12.5px;display:block;overflow-x:auto;max-width:100%}
  th,td{border:1px solid #e4e4e7;padding:4px 8px;text-align:left;vertical-align:top}
  th{background:#fafafa;font-weight:600}
</style></head><body>${html}</body></html>`
}

export default function MarkdownVenster({ rij, onClose }: { rij: BestandRij | null; onClose: () => void }) {
  const [document, setDocument] = useState<MarkdownDocument | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const query = rij?.bronQuery ?? null

  useEffect(() => {
    if (!query) return
    let afgebroken = false
    setDocument(null)
    setFout(null)

    fetch(`/api/dossier-bestand/markdown?${query}`)
      .then(async res => {
        const body = await res.json().catch(() => null)
        if (afgebroken) return
        if (!res.ok) setFout(body?.fout ?? 'Dit bestand kon niet gelezen worden.')
        else setDocument(body as MarkdownDocument)
      })
      .catch(() => { if (!afgebroken) setFout('Dit bestand kon niet opgehaald worden.') })

    return () => { afgebroken = true }
  }, [query])

  if (!rij) return null

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="xl" className="max-h-[92vh]">
        <DialogHeader>
          <div className="min-w-0 pr-8">
            <DialogTitle className="truncate">{document?.titel || rij.naam}</DialogTitle>
            <p className="mt-[3px] text-[12px] text-neutral-400">
              {document?.titel ? `${rij.naam} — ` : ''}markdown-document uit {rij.bron}
            </p>
          </div>
        </DialogHeader>

        <DialogBody className="pt-4">
          {fout ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
              {fout} Je kunt hem hieronder wel downloaden.
            </div>
          ) : !document ? (
            <p className="text-[13px] text-neutral-500">Document openen…</p>
          ) : document.tekens === 0 ? (
            <p className="text-[13px] text-neutral-500">Dit bestand is leeg.</p>
          ) : (
            <div className="rounded-lg border border-neutral-200">
              <iframe
                title="Inhoud van het document"
                // Geen allow-scripts en geen allow-same-origin: het document kan niets
                // uitvoeren en komt niet bij EVA-gegevens. De popup-rechten laten
                // alleen een link die je zelf aanklikt in een nieuw tabblad openen.
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={bouwDocument(document.html)}
                className="h-[64vh] w-full rounded-lg bg-white"
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter split>
          <span className="flex items-center gap-3">
            <a
              href={bestandUrl(rij, { download: true })}
              className="text-[12px] font-medium text-brand-600 hover:underline"
            >
              Bestand downloaden
            </a>
            {rij.openUrl && rij.bron === 'SharePoint' && (
              <a
                href={rij.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-medium text-neutral-500 hover:underline"
              >
                In SharePoint openen
              </a>
            )}
          </span>
          <Button variant="secondary" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
