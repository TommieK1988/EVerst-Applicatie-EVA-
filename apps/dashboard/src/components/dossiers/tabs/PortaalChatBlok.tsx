'use client'

import { useEffect, useState, useTransition } from 'react'
import { Card, CardHeader, CardBody, Button } from '@/components/ui'
import {
  getEvaPortaalChat, plaatsPortaalAntwoord, markeerPortaalChatGelezen,
  type EvaChatBericht,
} from '@/lib/portaal/beheer-actions'

/**
 * De klantchat, gezien vanuit EVA. Staat op de Informatie-tab naast de interne
 * notities.
 *
 * Het scherpe onderscheid tussen "dit leest de klant mee" en "dit is intern" is
 * hier de hele opgave. Twee tekstvakken onder elkaar waarvan er één wel en één
 * niet naar buiten gaat, is een reëel lekrisico — vandaar dat het knopje van
 * kleur verschiet en de kop meeverandert zodra je op intern staat.
 */
export function PortaalChatBlok({ dossierId }: { dossierId: string }) {
  // undefined = nog aan het laden, null = geen toegang (blok verdwijnt),
  // [] = wel toegang maar nog geen berichten.
  const [berichten, setBerichten] = useState<EvaChatBericht[] | null | undefined>(undefined)
  const [tekst, setTekst] = useState('')
  const [intern, setIntern] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, start] = useTransition()

  function herlaad() {
    getEvaPortaalChat(dossierId)
      .then(setBerichten)
      .catch(() => setBerichten(null))
  }

  useEffect(() => {
    herlaad()
    void markeerPortaalChatGelezen(dossierId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId])

  function versturen() {
    if (!tekst.trim()) return
    setFout(null)
    start(async () => {
      const r = await plaatsPortaalAntwoord(dossierId, tekst, { intern })
      if (!r.ok) { setFout(r.error); return }
      setTekst('')
      herlaad()
    })
  }

  // Geen recht op het klantportaal → het blok bestaat niet. Zolang we het nog
  // niet weten ook niet renderen, anders flitst er een blok voorbij dat daarna
  // verdwijnt.
  if (berichten === null || berichten === undefined) return null

  if (berichten.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span>Klantchat</span>
          <span className="text-[11px] font-normal opacity-80">zichtbaar voor de opdrachtgever</span>
        </CardHeader>
        <CardBody>
          <p className="text-[13px] text-neutral-500">
            Nog geen berichten. Wat je hier typt, leest de opdrachtgever in zijn projectomgeving —
            zet het portaal wel eerst open op de tab Klantportaal.
          </p>
          <Invoer
            tekst={tekst} setTekst={setTekst} intern={intern} setIntern={setIntern}
            bezig={bezig} fout={fout} onVersturen={versturen}
          />
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <span>Klantchat</span>
        <span className="text-[11px] font-normal opacity-80">zichtbaar voor de opdrachtgever</span>
      </CardHeader>
      <CardBody>
        <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {berichten.map(b => (
              <div key={b.id} className={b.vanKlant ? 'flex justify-start' : 'flex justify-end'}>
                <div
                  className={
                    b.intern
                      ? 'max-w-[85%] rounded-lg border border-dashed border-warning-300 bg-warning-50 px-3 py-2'
                      : b.vanKlant
                      ? 'max-w-[85%] rounded-lg bg-neutral-100 px-3 py-2'
                      : 'max-w-[85%] rounded-lg bg-brand-50 px-3 py-2'
                  }
                >
                  <p className="text-[10.5px] font-bold text-neutral-500">
                    {b.auteur}
                    {b.intern && <span className="ml-1.5 text-warning-700">· intern, niet zichtbaar voor de klant</span>}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{b.bericht}</p>
                  {b.bijlagen.map((bl, i) => (
                    <a
                      key={i}
                      href={bl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-[11.5px] font-medium text-brand-700 underline"
                    >
                      {bl.naam}
                    </a>
                  ))}
                  <p className="mt-0.5 text-[10px] text-neutral-400">
                    {new Date(b.op).toLocaleString('nl-NL', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
        </div>

        <Invoer
          tekst={tekst} setTekst={setTekst} intern={intern} setIntern={setIntern}
          bezig={bezig} fout={fout} onVersturen={versturen}
        />
      </CardBody>
    </Card>
  )
}

function Invoer({
  tekst, setTekst, intern, setIntern, bezig, fout, onVersturen,
}: {
  tekst: string; setTekst: (v: string) => void
  intern: boolean; setIntern: (v: boolean) => void
  bezig: boolean; fout: string | null
  onVersturen: () => void
}) {
  return (
    <div className={`mt-3 rounded-lg border p-2.5 ${intern ? 'border-warning-300 bg-warning-50' : 'border-neutral-200'}`}>
      <textarea
        value={tekst}
        onChange={e => setTekst(e.target.value)}
        rows={2}
        placeholder={intern ? 'Interne kanttekening — de klant ziet dit niet…' : 'Antwoord aan de opdrachtgever…'}
        className="w-full resize-y rounded border border-neutral-200 px-2 py-1.5 text-[13px] outline-none focus:border-brand-400"
      />
      {fout && <p className="mt-1 text-[12px] text-error-600">{fout}</p>}
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
          <input type="checkbox" checked={intern} onChange={e => setIntern(e.target.checked)} />
          Interne kanttekening
        </label>
        <Button size="sm" disabled={bezig || !tekst.trim()} onClick={onVersturen}>
          {bezig ? 'Bezig…' : intern ? 'Intern opslaan' : 'Naar de klant sturen'}
        </Button>
      </div>
    </div>
  )
}
