'use client'

import React, { useEffect, useRef, useState } from 'react'

/**
 * Tekstveld met inspreken. Bedoeld voor de buitendienst: op een steiger of een dak is typen op een
 * telefoon onwerkbaar, en een opleverpunt inspreken scheelt bij een ronde van twintig punten een
 * hoop tijd.
 *
 * Gebruikt de Web Speech API (`SpeechRecognition`), die in Chrome, Edge, Android Chrome en iOS
 * Safari ingebouwd zit. Bewust géén server-side transcriptie (Whisper e.d.): dat vraagt een
 * audio-upload, een API-sleutel en kosten per minuut, terwijl de telefoon dit zelf al kan.
 *
 * Kent de browser het niet (o.a. Firefox), dan verdwijnt de knop en blijft er een gewoon tekstveld
 * over — nooit een knop die niets doet.
 *
 * Twee eigenaardigheden van de Web Speech API vragen om extra werk, anders ziet de gebruiker zijn
 * ingesproken tekst verschijnen en weer verdwijnen:
 *
 * 1. Herkende tekst is eerst *voorlopig* en wordt pas later *definitief*. Stopt de herkenning
 *    voordat die omslag komt — op een telefoon gebeurt dat vaak — dan is die tekst weg. Daarom
 *    zetten we bij het einde van elke ronde vast wat er nog voorlopig in staat.
 * 2. De herkenning stopt al na een paar seconden stilte, ook midden in een gedachte. Zolang de
 *    gebruiker niet op stoppen tikte pakken we hem meteen weer op. Na een paar stille rondes gaat
 *    de microfoon alsnog uit: hij mag nooit ongemerkt aan blijven staan.
 *
 * LET OP: spraakherkenning vraagt om HTTPS én om toestemming voor de microfoon. Lokaal op
 * http://localhost werkt het; op een http-adres in het netwerk niet.
 */

/* De Web Speech API staat niet in lib.dom, en achter een vendor-prefix. Minimale eigen typering. */
type SpraakResultaat = {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: { transcript: string }
}
type SpraakEvent = {
  resultIndex: number
  results: { readonly length: number; [index: number]: SpraakResultaat }
}
type Herkenner = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpraakEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function maakHerkenner(): Herkenner | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Herkenner; webkitSpeechRecognition?: new () => Herkenner }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

/**
 * Zoveel rondes zonder een woord voordat de microfoon vanzelf uitgaat. Bij ongeveer vijf seconden
 * stilte per ronde is dat een kleine kwart minuut: lang genoeg om na te denken, kort genoeg om
 * geen microfoon in een broekzak te laten meeluisteren.
 */
const MAX_STILLE_RONDES = 3

const FOUT_TEKST: Record<string, string> = {
  'not-allowed': 'Geen toegang tot de microfoon. Sta dat toe in je browserinstellingen.',
  'service-not-allowed': 'Geen toegang tot de microfoon. Sta dat toe in je browserinstellingen.',
  network: 'Inspreken heeft internet nodig — geen verbinding.',
  'audio-capture': 'Geen microfoon gevonden.',
}

export default function SpraakTextarea({
  id, value, onChange, placeholder, style, rows,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  rows?: number
}) {
  const [ondersteund, setOndersteund] = useState(false)
  const [luistert, setLuistert] = useState(false)
  const [tussentijds, setTussentijds] = useState('')
  const [fout, setFout] = useState<string | null>(null)

  const herkennerRef = useRef<Herkenner | null>(null)
  // De tekst zoals die was toen het inspreken begon. Wat er wordt herkend komt hierachter, zodat
  // een tussentijds resultaat dat later wordt bijgesteld niet steeds achter zichzelf plakt.
  const basisRef = useRef('')
  // Het voorlopige resultaat ook als ref: de afhandelaars van de herkenner lezen hem buiten een
  // render om, en `tussentijds` uit de state zou daar de waarde van bij het starten zijn.
  const tussentijdsRef = useRef('')
  // Wil de gebruiker nog luisteren? Blijft `true` tot hij op stoppen tikt of er iets misgaat, en
  // bepaalt of een ronde die vanzelf eindigt weer wordt opgepakt.
  const wilLuisterenRef = useRef(false)
  const stilleRondesRef = useRef(0)
  // `value` via een ref, anders zou de handler bij elke toetsaanslag opnieuw gebonden moeten worden.
  const valueRef = useRef(value)
  valueRef.current = value
  // Idem voor `onChange`: de afhandelaars van een ronde blijven leven over renders heen.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setOndersteund(maakHerkenner() !== null)
    return () => { wilLuisterenRef.current = false; herkennerRef.current?.abort() }
  }, [])

  /** Zet vast wat er voorlopig herkend is, zodat het niet verloren gaat als de ronde stopt. */
  function vastzetten() {
    const rest = tussentijdsRef.current
    tussentijdsRef.current = ''
    setTussentijds('')
    if (!rest.trim()) return
    basisRef.current = voegSamen(basisRef.current, rest)
    onChangeRef.current(basisRef.current)
  }

  function stop() {
    wilLuisterenRef.current = false
    setLuistert(false)
    // Niet `abort()`: `stop()` levert het laatste resultaat nog af. Wat dan nog voorlopig is,
    // wordt in `onend` vastgezet.
    herkennerRef.current?.stop()
  }

  function start() {
    setFout(null)
    basisRef.current = valueRef.current
    tussentijdsRef.current = ''
    setTussentijds('')
    wilLuisterenRef.current = true
    stilleRondesRef.current = 0

    if (!luisterRonde()) {
      wilLuisterenRef.current = false
      setFout('Inspreken kon niet starten.')
      return
    }
    setLuistert(true)
  }

  /** Eén herkenningssessie. Geeft `false` als de browser hem niet wil starten. */
  function luisterRonde(): boolean {
    const h = maakHerkenner()
    if (!h) return false
    herkennerRef.current = h
    h.lang = 'nl-NL'
    h.continuous = true
    h.interimResults = true

    h.onresult = e => {
      let definitief = ''
      let voorlopig = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const tekst = res[0]?.transcript ?? ''
        if (res.isFinal) definitief += tekst
        else voorlopig += tekst
      }
      if (definitief.trim() || voorlopig.trim()) stilleRondesRef.current = 0
      if (definitief) {
        basisRef.current = voegSamen(basisRef.current, definitief)
        onChangeRef.current(basisRef.current)
      }
      tussentijdsRef.current = voorlopig
      setTussentijds(voorlopig)
    }

    h.onerror = e => {
      // 'no-speech' is geen fout om de gebruiker mee lastig te vallen — dat is gewoon "je zei even
      // niets", en `onend` pakt de volgende ronde op. 'aborted' is "je tikte op stoppen".
      if (e.error === 'no-speech') return
      if (e.error !== 'aborted') {
        setFout(FOUT_TEKST[e.error] ?? 'Inspreken lukte niet. Probeer het opnieuw of typ de tekst.')
      }
      wilLuisterenRef.current = false
    }

    h.onend = () => {
      vastzetten()
      stilleRondesRef.current += 1
      if (wilLuisterenRef.current && stilleRondesRef.current <= MAX_STILLE_RONDES && luisterRonde()) return
      wilLuisterenRef.current = false
      setLuistert(false)
    }

    try {
      h.start()
      return true
    } catch {
      return false
    }
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <textarea
          id={id}
          // Ook ná het stoppen nog het voorlopige resultaat tonen: dat wordt in `onend` alsnog
          // vastgezet, en tot dat moment de tekst laten verdwijnen leest als verlies.
          value={tussentijds ? voegSamen(value, tussentijds) : value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          // Tijdens het inspreken is het veld het weergavevlak van wat er herkend wordt; typen
          // zou het tussentijdse resultaat meteen weer overschrijven.
          readOnly={luistert}
          style={{
            ...style,
            paddingRight: ondersteund ? 52 : style?.paddingRight,
            background: luistert ? '#f7fbf8' : style?.background,
          }}
        />

        {ondersteund && (
          <button
            type="button"
            onClick={() => (luistert ? stop() : start())}
            aria-label={luistert ? 'Stoppen met inspreken' : 'Inspreken'}
            aria-pressed={luistert}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 38, height: 38, borderRadius: '50%',
              border: luistert ? 'none' : '1px solid #e3e8ea',
              background: luistert ? '#b42318' : '#fff',
              color: luistert ? '#fff' : '#6b757c',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <MicroIcoon />
          </button>
        )}
      </div>

      {luistert && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, fontSize: 12.5, color: '#b42318' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#b42318',
            animation: 'eva-puls 1.2s ease-in-out infinite',
          }} />
          Luisteren… tik op de microfoon als je klaar bent.
          <style>{'@keyframes eva-puls{0%,100%{opacity:1}50%{opacity:.25}}'}</style>
        </div>
      )}

      {fout && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: '#b42318' }}>{fout}</div>
      )}
    </div>
  )
}

/** Plakt herkende tekst achter de bestaande, met precies één spatie ertussen. */
function voegSamen(basis: string, nieuw: string): string {
  const links = basis.trimEnd()
  const rechts = nieuw.trim()
  if (!rechts) return basis
  if (!links) return rechts.charAt(0).toUpperCase() + rechts.slice(1)
  return `${links} ${rechts}`
}

function MicroIcoon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
  )
}
