'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, RefreshCw, Trash2, Save, X } from 'lucide-react'
import {
  getIntegraties, slaIntegratieOp, verwijderIntegratie, syncIntegratie,
  type DicoIntegratie, type DicoAuthType, type IntegratieInput,
} from '@/app/(platform)/everts-calc/actions/dico-integraties'

const AUTH_LABELS: Record<DicoAuthType, string> = {
  none: 'Geen',
  basic: 'Basic (gebruiker + wachtwoord)',
  bearer: 'Bearer-token',
  apikey: 'API-key (header)',
}

const LEEG: IntegratieInput = { leverancier: '', endpoint_url: '', auth_type: 'none', auth_gebruiker: '', auth_geheim: '', actief: true }

export default function DicoIntegratiesBeheer() {
  const [lijst, setLijst] = useState<DicoIntegratie[]>([])
  const [laden, setLaden] = useState(true)
  const [form, setForm] = useState<IntegratieInput | null>(null)
  const [bezig, setBezig] = useState<string | null>(null)

  const laad = async () => {
    setLaden(true)
    try { setLijst(await getIntegraties()) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Laden mislukt') }
    finally { setLaden(false) }
  }
  useEffect(() => { void laad() }, [])

  const bewerk = (i: DicoIntegratie) => setForm({
    id: i.id, leverancier: i.leverancier, endpoint_url: i.endpoint_url ?? '',
    auth_type: i.auth_type, auth_gebruiker: i.auth_gebruiker ?? '', auth_geheim: '', actief: i.actief,
  })

  const opslaan = async () => {
    if (!form) return
    if (!form.leverancier.trim()) { toast.error('Leverancier is verplicht'); return }
    try {
      await slaIntegratieOp(form)
      toast.success('Integratie opgeslagen')
      setForm(null)
      await laad()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Opslaan mislukt') }
  }

  const verwijder = async (id: string) => {
    if (!confirm('Integratie verwijderen?')) return
    try { await verwijderIntegratie(id); await laad() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt') }
  }

  const sync = async (id: string) => {
    setBezig(id)
    try {
      const r = await syncIntegratie(id)
      toast.success(`Sync klaar: ${r.aangemaakt} nieuw, ${r.bijgewerkt} bijgewerkt (${r.gevonden} gevonden)`)
      await laad()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Sync mislukt') }
    finally { setBezig(null) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">DICO / Ketenstandaard koppeling</p>
        <p>
          Koppel een leverancierscatalogus via de DICO-standaard. Importeer eenmalig een
          DICO-bestand op de Materialen-pagina, of configureer hier een live API-sync per leverancier.
          Het exacte endpoint-contract verschilt per leverancier — bevestig met een voorbeeldrespons.
        </p>
      </div>

      {/* Lijst */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {laden && <div className="p-5 text-sm text-slate-400">Laden…</div>}
        {!laden && lijst.length === 0 && (
          <div className="p-5 text-sm text-slate-400">Nog geen DICO-integraties geconfigureerd.</div>
        )}
        {lijst.map(i => (
          <div key={i.id} className="p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800 text-sm">{i.leverancier}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${i.actief ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                  {i.actief ? 'Actief' : 'Inactief'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">{i.endpoint_url || 'Geen endpoint ingesteld'}</p>
              {i.laatste_status && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Laatste sync: {i.laatst_gesynct ? new Date(i.laatst_gesynct).toLocaleString('nl-NL') : '—'} · {i.laatste_status}
                </p>
              )}
            </div>
            <button
              onClick={() => sync(i.id)}
              disabled={!i.endpoint_url || bezig === i.id}
              className="inline-flex items-center gap-1 text-xs text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              title="Nu synchroniseren"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${bezig === i.id ? 'animate-spin' : ''}`} /> Sync
            </button>
            <button onClick={() => bewerk(i)} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">Bewerken</button>
            <button onClick={() => verwijder(i.id)} className="text-slate-300 hover:text-red-500 p-1.5"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {/* Toevoegen/bewerken */}
      {form ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">{form.id ? 'Integratie bewerken' : 'Nieuwe integratie'}</h3>
            <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <Veld label="Leverancier">
            <input value={form.leverancier} onChange={e => setForm({ ...form, leverancier: e.target.value })} className={inputCls} placeholder="bijv. Galvano" />
          </Veld>
          <Veld label="Endpoint-URL (catalogus)">
            <input value={form.endpoint_url ?? ''} onChange={e => setForm({ ...form, endpoint_url: e.target.value })} className={inputCls} placeholder="https://…" />
          </Veld>
          <Veld label="Authenticatie">
            <select value={form.auth_type} onChange={e => setForm({ ...form, auth_type: e.target.value as DicoAuthType })} className={inputCls}>
              {(Object.keys(AUTH_LABELS) as DicoAuthType[]).map(k => <option key={k} value={k}>{AUTH_LABELS[k]}</option>)}
            </select>
          </Veld>
          {form.auth_type !== 'none' && (
            <div className="grid grid-cols-2 gap-3">
              <Veld label={form.auth_type === 'apikey' ? 'Header-naam' : 'Gebruiker'}>
                <input value={form.auth_gebruiker ?? ''} onChange={e => setForm({ ...form, auth_gebruiker: e.target.value })} className={inputCls}
                  placeholder={form.auth_type === 'apikey' ? 'X-API-Key' : ''} />
              </Veld>
              <Veld label={form.id ? 'Geheim (leeg = ongewijzigd)' : 'Geheim / token'}>
                <input type="password" value={form.auth_geheim ?? ''} onChange={e => setForm({ ...form, auth_geheim: e.target.value })} className={inputCls} />
              </Veld>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.actief} onChange={e => setForm({ ...form, actief: e.target.checked })} /> Actief
          </label>
          <button onClick={opslaan} className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
            <Save className="w-4 h-4" /> Opslaan
          </button>
        </div>
      ) : (
        <button onClick={() => setForm({ ...LEEG })} className="inline-flex items-center gap-1 text-sm text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Integratie toevoegen
        </button>
      )}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts'

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
