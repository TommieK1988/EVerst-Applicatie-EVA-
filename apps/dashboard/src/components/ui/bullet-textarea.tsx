'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/**
 * Tekstveld dat meegroeit met de inhoud en opsommingstekens ondersteunt.
 *
 * - Hoogte volgt de tekst: begint op `minRows` regels en groeit tot `maxRows`,
 *   daarna verschijnt een schuifbalk. Zo zie je altijd de hele werkomschrijving.
 * - Knop (of Ctrl/Cmd+Shift+8) zet de geselecteerde regels om in een opsomming
 *   en haalt de bullets er net zo makkelijk weer af.
 * - Enter op een bullet-regel begint automatisch een nieuwe bullet; Enter op een
 *   lege bullet sluit de opsomming af.
 */

const BULLET = '• '
/** Herkent "  • " aan het begin van een regel; groep 1 = inspringing, groep 2 = bullet. */
const BULLET_RE = /^([ \t]*)(•[ \t]?)/

function isBullet(regel: string) {
  return BULLET_RE.test(regel)
}

/** Begin van de regel waarin `pos` valt. */
function regelStart(tekst: string, pos: number) {
  return tekst.lastIndexOf('\n', pos - 1) + 1
}

/** Einde van de regel waarin `pos` valt (exclusief de newline). */
function regelEind(tekst: string, pos: number) {
  const i = tekst.indexOf('\n', pos)
  return i === -1 ? tekst.length : i
}

/** Zet de regels binnen de selectie om in een opsomming — of haalt de bullets eraf. */
function wisselBullets(waarde: string, selStart: number, selEnd: number) {
  const start = regelStart(waarde, selStart)
  const eind = regelEind(waarde, selEnd)
  const regels = waarde.slice(start, eind).split('\n')

  const gevuld = regels.filter(r => r.trim() !== '')
  const allemaalBullet = gevuld.length > 0 && gevuld.every(isBullet)

  const nieuweRegels = regels.map(r => {
    if (allemaalBullet) return r.replace(BULLET_RE, '$1')
    if (isBullet(r) || r.trim() === '') return r
    const inspring = /^[ \t]*/.exec(r)?.[0] ?? ''
    return inspring + BULLET + r.slice(inspring.length)
  })

  // Lege selectie op een lege regel: dan wél een bullet neerzetten om mee te beginnen.
  if (!allemaalBullet && nieuweRegels.length === 1 && nieuweRegels[0].trim() === '') {
    nieuweRegels[0] = BULLET
  }

  const blok = nieuweRegels.join('\n')
  return {
    waarde: waarde.slice(0, start) + blok + waarde.slice(eind),
    selStart: start,
    selEnd: start + blok.length,
  }
}

/** Enter op een bullet-regel: nieuwe bullet, of opsomming afsluiten bij een lege bullet. */
function bulletEnter(waarde: string, pos: number) {
  const start = regelStart(waarde, pos)
  const regel = waarde.slice(start, regelEind(waarde, pos))
  const match = BULLET_RE.exec(regel)
  if (!match) return null

  const prefix = match[0]
  // Lege bullet → bullet weghalen en de opsomming beëindigen.
  if (regel.slice(prefix.length).trim() === '') {
    const nieuw = waarde.slice(0, start) + waarde.slice(start + regel.length)
    return { waarde: nieuw, sel: start }
  }

  const invoeging = '\n' + match[1] + BULLET
  return {
    waarde: waarde.slice(0, pos) + invoeging + waarde.slice(pos),
    sel: pos + invoeging.length,
  }
}

export interface BulletTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'> {
  value: string
  onChange: (waarde: string) => void
  /** Starthoogte in regels (standaard 3). */
  minRows?: number
  /** Vanaf hier komt er een schuifbalk in plaats van meer hoogte (standaard 24). */
  maxRows?: number
  /** Knop "Opsomming" tonen. */
  toonKnop?: boolean
  /** Optioneel label; komt links op dezelfde regel als de opsommingsknop. */
  label?: React.ReactNode
  className?: string
  toolbarClassName?: string
}

export function BulletTextarea({
  value,
  onChange,
  minRows = 3,
  maxRows = 24,
  toonKnop = true,
  label,
  className,
  toolbarClassName,
  onKeyDown,
  ...props
}: BulletTextareaProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const selectieNaUpdate = React.useRef<[number, number] | null>(null)
  const laatsteBreedte = React.useRef(0)

  const groeiMee = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const stijl = window.getComputedStyle(el)
    let regelhoogte = parseFloat(stijl.lineHeight)
    if (!Number.isFinite(regelhoogte)) regelhoogte = (parseFloat(stijl.fontSize) || 13) * 1.5
    const padding = parseFloat(stijl.paddingTop) + parseFloat(stijl.paddingBottom)
    const rand = parseFloat(stijl.borderTopWidth) + parseFloat(stijl.borderBottomWidth)
    const min = regelhoogte * minRows + padding + rand
    const max = regelhoogte * maxRows + padding + rand
    const gewenst = el.scrollHeight + rand
    el.style.height = `${Math.min(Math.max(gewenst, min), max)}px`
    el.style.overflowY = gewenst > max ? 'auto' : 'hidden'
  }, [minRows, maxRows])

  React.useLayoutEffect(() => {
    groeiMee()
    const sel = selectieNaUpdate.current
    if (sel && ref.current) {
      selectieNaUpdate.current = null
      ref.current.focus()
      ref.current.setSelectionRange(sel[0], sel[1])
    }
  }, [value, groeiMee])

  // Wordt het veld smaller (kolom versleept, venster verkleind), dan wijzigt de
  // tekstomloop en dus de benodigde hoogte.
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    laatsteBreedte.current = el.clientWidth
    const obs = new ResizeObserver(() => {
      const breedte = el.clientWidth
      if (breedte === laatsteBreedte.current) return
      laatsteBreedte.current = breedte
      groeiMee()
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [groeiMee])

  function pasToe(nieuw: string, selStart: number, selEnd = selStart) {
    selectieNaUpdate.current = [selStart, selEnd]
    onChange(nieuw)
  }

  function opsomming() {
    const el = ref.current
    if (!el) return
    const pos = el.selectionStart
    const r = wisselBullets(value, pos, el.selectionEnd)

    // Zonder selectie blijft de cursor staan waar hij stond — hij schuift alleen
    // mee met de bullet die op zijn eigen regel is bijgekomen of weggehaald.
    if (pos === el.selectionEnd) {
      const start = regelStart(value, pos)
      const oudeRegelLengte = regelEind(value, pos) - start
      const nieuweRegelLengte = regelEind(r.waarde, start) - start
      const caret = Math.max(start, pos + (nieuweRegelLengte - oudeRegelLengte))
      pasToe(r.waarde, caret)
      return
    }

    pasToe(r.waarde, r.selStart, r.selEnd)
  }

  function toetsAanslag(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e)
    if (e.defaultPrevented) return

    // Ctrl/Cmd+Shift+8 — dezelfde snelkoppeling als in Word.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '8' || e.key === '*')) {
      e.preventDefault()
      opsomming()
      return
    }

    const el = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      const r = bulletEnter(value, el.selectionStart)
      if (r) {
        e.preventDefault()
        pasToe(r.waarde, r.sel)
      }
    }
  }

  return (
    <div>
      {(toonKnop || label) && (
        <div className={cn('flex items-center justify-between gap-2 mb-1', toolbarClassName)}>
          <span className="min-w-0">{label}</span>
          {toonKnop && <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={opsomming}
            className="text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2 py-0.5 rounded transition-colors"
            title="Opsomming aan/uit voor de geselecteerde regels (Ctrl+Shift+8)"
          >
            {'• Opsomming'}
          </button>}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={toetsAanslag}
        className={cn('resize-none', className)}
        {...props}
      />
    </div>
  )
}
