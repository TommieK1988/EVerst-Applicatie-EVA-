'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, RefreshCw, Settings2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverBody } from '@/components/ui/popover'
import {
  haalTodoStatus, synchroniseerMijnToDo, zetTodoLijstActief, type TodoStatus,
} from '@/app/(platform)/mijn-taken/todo-actions'

/**
 * Microsoft To Do boven Mijn acties: haalt bij het openen meteen op wat er in To Do
 * veranderde, toont de koppelstatus en laat per lijst kiezen of hij meedoet.
 *
 * Bewust stil als de koppeling in EVA (nog) niet aanstaat: dan rendert hij niets.
 */
export default function TodoKoppelingBalk() {
  const router = useRouter()
  const [status, setStatus] = useState<TodoStatus | null>(null)
  const [bezig, setBezig] = useState(false)
  const [, startTransition] = useTransition()
  const gestart = useRef(false)

  const synchroniseer = async (stil: boolean) => {
    setBezig(true)
    try {
      const res = await synchroniseerMijnToDo()
      if (!res.ok) {
        if (!stil) toast.error(res.fout)
        return
      }
      const totaal = res.nieuw + res.bijgewerkt + res.vervallen
      if (totaal) router.refresh()
      if (!stil) toast.success(totaal ? `${res.nieuw} nieuw, ${res.bijgewerkt} bijgewerkt uit To Do` : 'To Do is bijgewerkt')
      setStatus(await haalTodoStatus())
    } finally {
      setBezig(false)
    }
  }

  useEffect(() => {
    if (gestart.current) return
    gestart.current = true
    void (async () => {
      const s = await haalTodoStatus().catch(() => null)
      setStatus(s)
      if (s?.beschikbaar && s.koppeling === 'bruikbaar') await synchroniseer(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!status?.beschikbaar) return null

  const koppelUrl = `/api/auth/o365?${new URLSearchParams({ medewerker_id: status.medewerkerId, terug: '/mijn-taken' })}`
  const laatst = status.lijsten
    .map(l => l.laatst_gesynct)
    .filter(Boolean)
    .sort()
    .at(-1)

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] text-neutral-700">
      <ListChecks className="h-4 w-4 text-neutral-500" />
      <span className="font-semibold text-neutral-900">Microsoft To Do</span>

      {status.koppeling === 'bruikbaar' ? (
        <>
          <span className="text-neutral-500">
            {laatst ? `Bijgewerkt ${format(parseISO(laatst), "d MMM 'om' HH:mm", { locale: nl })}` : 'Nog niet opgehaald'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"><Settings2 className="h-3.5 w-3.5" /> Lijsten</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <PopoverHeader>Welke lijsten doen mee</PopoverHeader>
                <PopoverBody>
                  {status.lijsten.length === 0 && (
                    <p className="px-2 py-2 text-xs text-neutral-500">Nog geen lijsten opgehaald.</p>
                  )}
                  {status.lijsten.map(l => (
                    <label key={l.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-neutral-50">
                      <span className="truncate">{l.naam}</span>
                      <Switch
                        size="sm"
                        checked={l.actief}
                        onCheckedChange={actief => {
                          setStatus(s => s && { ...s, lijsten: s.lijsten.map(x => x.id === l.id ? { ...x, actief } : x) })
                          startTransition(async () => {
                            await zetTodoLijstActief(l.id, actief)
                            if (actief) await synchroniseer(true)
                          })
                        }}
                      />
                    </label>
                  ))}
                  <p className="px-2 pt-2 text-xs text-neutral-500">
                    Uitzetten laat de acties die er al staan staan en haalt geen nieuwe meer op.
                  </p>
                </PopoverBody>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" loading={bezig} onClick={() => synchroniseer(false)}>
              <RefreshCw className="h-3.5 w-3.5" /> Nu ophalen
            </Button>
          </div>
        </>
      ) : status.koppeling === 'onbekend' ? (
        <span className="text-neutral-500">Microsoft is nu niet bereikbaar; probeer het straks opnieuw.</span>
      ) : (
        <>
          <span className="text-neutral-500">
            {status.koppeling === 'verlopen'
              ? 'Je koppeling met Microsoft is verlopen.'
              : status.koppeling === 'onvolledig'
                ? 'Koppel opnieuw om je To Do-taken hier te zien.'
                : 'Koppel je Microsoft-account om je To Do-taken hier te zien.'}
          </span>
          <Button asChild variant="primary" size="sm" className="ml-auto">
            <a href={koppelUrl}>Koppelen</a>
          </Button>
        </>
      )}
    </div>
  )
}
