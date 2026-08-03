'use client'
import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from './alert-dialog'
import { Button } from './button'
import { Input, Textarea } from './input'

/**
 * EVA-dialogen — vervangt de browser-eigen `window.confirm` / `alert` / `prompt`.
 *
 * De native popups zijn niet te stylen, tonen de URL van de site, verschillen per
 * browser en blokkeren de JS-thread. Deze provider geeft dezelfde belofte-gebaseerde
 * ergonomie ("await en je hebt het antwoord") maar dan in de EVA-huisstijl:
 *
 *   const { bevestig, meld, vraagTekst } = useDialogen()
 *   if (!(await bevestig({ titel: 'Regel verwijderen?', destructief: true }))) return
 *
 * De provider hangt in de root-layout, dus hij is beschikbaar op /(platform), /m en
 * de publieke routes. Ontbreekt hij toch (bijv. een los gerenderde boom in een test),
 * dan valt elke functie terug op de native variant — een knop mag nooit stukgaan
 * omdat de context mist.
 */

export interface BevestigOpties {
  titel: string
  omschrijving?: React.ReactNode
  /** Label van de bevestigknop. Standaard 'Bevestigen'. */
  bevestigLabel?: string
  annuleerLabel?: string
  /** Rode bevestigknop — gebruik bij verwijderen en ander onomkeerbaar werk. */
  destructief?: boolean
}

export interface MeldingOpties {
  titel: string
  omschrijving?: React.ReactNode
  sluitLabel?: string
}

export interface TekstOpties {
  titel: string
  omschrijving?: React.ReactNode
  /** Label boven het invoerveld. */
  label?: string
  /** Voorgevulde waarde. */
  standaard?: string
  placeholder?: string
  /** Meerregelig invoerveld i.p.v. één regel. */
  meerregelig?: boolean
  /** Bevestigen kan pas met een niet-lege waarde. */
  verplicht?: boolean
  bevestigLabel?: string
}

interface DialoogApi {
  /** Ja/nee-vraag. Resolvet `false` bij annuleren, Escape of klik naast de dialoog. */
  bevestig: (opties: BevestigOpties | string) => Promise<boolean>
  /** Mededeling met alleen een OK-knop. */
  meld: (opties: MeldingOpties | string) => Promise<void>
  /** Vraagt om tekst. Resolvet `null` bij annuleren. */
  vraagTekst: (opties: TekstOpties | string) => Promise<string | null>
}

type Verzoek =
  | { soort: 'bevestig'; opties: BevestigOpties; resolve: (waarde: boolean) => void }
  | { soort: 'melding'; opties: MeldingOpties; resolve: () => void }
  | { soort: 'tekst'; opties: TekstOpties; resolve: (waarde: string | null) => void }

/** Roept de resolver van een afgebroken/afgerond verzoek aan met de annuleer-uitkomst. */
function annuleerVerzoek(verzoek: Verzoek) {
  if (verzoek.soort === 'melding') verzoek.resolve()
  else if (verzoek.soort === 'bevestig') verzoek.resolve(false)
  else verzoek.resolve(null)
}

const nativeFallback: DialoogApi = {
  bevestig: async (opties) => {
    const o = typeof opties === 'string' ? { titel: opties } : opties
    return window.confirm([o.titel, typeof o.omschrijving === 'string' ? o.omschrijving : ''].filter(Boolean).join('\n\n'))
  },
  meld: async (opties) => {
    const o = typeof opties === 'string' ? { titel: opties } : opties
    window.alert([o.titel, typeof o.omschrijving === 'string' ? o.omschrijving : ''].filter(Boolean).join('\n\n'))
  },
  vraagTekst: async (opties) => {
    const o = typeof opties === 'string' ? { titel: opties } : opties
    return window.prompt(o.titel, o.standaard ?? '')
  },
}

const DialoogContext = React.createContext<DialoogApi | null>(null)

/** Belofte-gebaseerde EVA-dialogen: `bevestig`, `meld` en `vraagTekst`. */
export function useDialogen(): DialoogApi {
  const ctx = React.useContext(DialoogContext)
  if (ctx) return ctx
  if (process.env.NODE_ENV !== 'production') {
    console.warn('useDialogen() buiten <DialoogProvider>: terugval op de browser-popup.')
  }
  return nativeFallback
}

/** Kortere variant wanneer alleen een ja/nee-vraag nodig is. */
export function useBevestig(): DialoogApi['bevestig'] {
  return useDialogen().bevestig
}

export function DialoogProvider({ children }: { children: React.ReactNode }) {
  const [verzoek, setVerzoek] = React.useState<Verzoek | null>(null)
  const [open, setOpen] = React.useState(false)
  const [tekst, setTekst] = React.useState('')
  // Het openstaande verzoek óók in een ref: `afronden` wordt vanuit event-handlers
  // en vanuit onOpenChange aangeroepen en moet de resolver precies één keer zien.
  const lopend = React.useRef<Verzoek | null>(null)

  const afronden = React.useCallback((bevestigd: boolean, waarde?: string) => {
    const v = lopend.current
    lopend.current = null
    setOpen(false)
    if (!v) return
    if (v.soort === 'melding') v.resolve()
    else if (v.soort === 'bevestig') v.resolve(bevestigd)
    else v.resolve(bevestigd ? (waarde ?? '') : null)
  }, [])

  const start = React.useCallback((v: Verzoek) => {
    // Een nieuw verzoek terwijl er nog een openstaat: de oude belofte moet resolven,
    // anders blijft de aanroeper eeuwig op zijn `await` hangen.
    if (lopend.current) annuleerVerzoek(lopend.current)
    lopend.current = v
    setVerzoek(v)
    setTekst(v.soort === 'tekst' ? (v.opties.standaard ?? '') : '')
    setOpen(true)
  }, [])

  const api = React.useMemo<DialoogApi>(() => ({
    bevestig: (opties) =>
      new Promise<boolean>((resolve) => {
        start({ soort: 'bevestig', opties: typeof opties === 'string' ? { titel: opties } : opties, resolve })
      }),
    meld: (opties) =>
      new Promise<void>((resolve) => {
        start({ soort: 'melding', opties: typeof opties === 'string' ? { titel: opties } : opties, resolve })
      }),
    vraagTekst: (opties) =>
      new Promise<string | null>((resolve) => {
        start({ soort: 'tekst', opties: typeof opties === 'string' ? { titel: opties } : opties, resolve })
      }),
  }), [start])

  const tekstLeeg = tekst.trim().length === 0
  const tekstGeblokkeerd = verzoek?.soort === 'tekst' && verzoek.opties.verplicht === true && tekstLeeg

  return (
    <DialoogContext.Provider value={api}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) afronden(false) }}>
        {verzoek && (
          <AlertDialogContent
            onOpenAutoFocus={(e) => {
              // Bij een tekstvraag hoort de focus in het invoerveld; Radix zet hem
              // standaard op de annuleerknop (juist gedrag voor een ja/nee-vraag).
              if (verzoek.soort !== 'tekst') return
              e.preventDefault()
              const veld = (e.currentTarget as HTMLElement).querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-eva-tekstveld]')
              veld?.focus()
              veld?.select()
            }}
          >
            <AlertDialogTitle>{verzoek.opties.titel}</AlertDialogTitle>
            {verzoek.opties.omschrijving ? (
              <AlertDialogDescription>{verzoek.opties.omschrijving}</AlertDialogDescription>
            ) : (
              // Radix waarschuwt zonder Description; een lege, verborgen node houdt
              // de a11y-koppeling intact zonder witruimte in beeld.
              <AlertDialogDescription className="sr-only">{verzoek.opties.titel}</AlertDialogDescription>
            )}

            {verzoek.soort === 'tekst' && (
              <div className="mt-3 flex flex-col gap-1.5">
                {verzoek.opties.label && (
                  <label className="text-[12px] font-semibold text-neutral-700">{verzoek.opties.label}</label>
                )}
                {verzoek.opties.meerregelig ? (
                  <Textarea
                    data-eva-tekstveld
                    value={tekst}
                    placeholder={verzoek.opties.placeholder}
                    onChange={(e) => setTekst(e.target.value)}
                  />
                ) : (
                  <Input
                    data-eva-tekstveld
                    value={tekst}
                    placeholder={verzoek.opties.placeholder}
                    onChange={(e) => setTekst(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      if (!tekstGeblokkeerd) afronden(true, tekst)
                    }}
                  />
                )}
              </div>
            )}

            <AlertDialogFooter>
              {verzoek.soort === 'melding' ? (
                <AlertDialogAction variant="primary" onClick={() => afronden(true)}>
                  {verzoek.opties.sluitLabel ?? 'Oké'}
                </AlertDialogAction>
              ) : (
                <>
                  <AlertDialogCancel onClick={() => afronden(false)}>
                    {verzoek.soort === 'bevestig' ? (verzoek.opties.annuleerLabel ?? 'Annuleren') : 'Annuleren'}
                  </AlertDialogCancel>
                  {verzoek.soort === 'bevestig' ? (
                    <AlertDialogAction
                      variant={verzoek.opties.destructief ? 'destructive' : 'primary'}
                      onClick={() => afronden(true)}
                    >
                      {verzoek.opties.bevestigLabel ?? 'Bevestigen'}
                    </AlertDialogAction>
                  ) : (
                    // Geen AlertDialogAction: die sluit altijd, ook wanneer een
                    // verplicht veld nog leeg is.
                    <Button variant="primary" disabled={tekstGeblokkeerd} onClick={() => afronden(true, tekst)}>
                      {verzoek.opties.bevestigLabel ?? 'Opslaan'}
                    </Button>
                  )}
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </DialoogContext.Provider>
  )
}
