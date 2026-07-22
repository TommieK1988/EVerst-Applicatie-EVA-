'use client'

import { useState, useTransition } from 'react'
import { Button, Card, CardBody, Input } from '@/components/ui'
import { saveBouw7Config, testBouw7Connection, runFullSync, debugBouw7Quotations, debugBouw7Projects, verifyBouw7WriteAccess, discoverBouw7Bestelregels, discoverBouw7Contracten, type RunSyncResult, type QuotationDebugResult, type ProjectDebugResult, type WriteCheckResult, type BestelregelRefsResult, type ContractRefsResult } from './actions'

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'success'; msg?: string } | { kind: 'error'; message: string }

export function Bouw7Config({ existingId, existingKey, existingAppName, laatstSync }: {
  existingId: string | null
  existingKey: string | null
  existingAppName: string | null
  laatstSync: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [syncResult, setSyncResult] = useState<RunSyncResult | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [quotationDebug, setQuotationDebug] = useState<QuotationDebugResult | null>(null)
  const [quotationDebugging, setQuotationDebugging] = useState(false)
  const [projectDebug, setProjectDebug] = useState<ProjectDebugResult | null>(null)
  const [projectDebugging, setProjectDebugging] = useState(false)
  const [writeCheck, setWriteCheck] = useState<WriteCheckResult | null>(null)
  const [writeChecking, setWriteChecking] = useState(false)
  const [poRefs, setPoRefs] = useState<BestelregelRefsResult | null>(null)
  const [poRefsLoading, setPoRefsLoading] = useState(false)
  const [contractRefs, setContractRefs] = useState<ContractRefsResult | null>(null)
  const [contractRefsLoading, setContractRefsLoading] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* API Key configuratie */}
      <form action={(formData) => {
        setStatus({ kind: 'saving' })
        startTransition(async () => {
          const result = await saveBouw7Config(formData)
          if (result.ok) setStatus({ kind: 'success', msg: 'API key opgeslagen' })
          else setStatus({ kind: 'error', message: result.error })
        })
      }}>
        {existingId && <input type="hidden" name="id" value={existingId} />}

        <Card>
          <CardBody>
          <p className="eva-section-label">API Configuratie</p>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Je API key vind je op{' '}
            <a href="https://start.bouw7.nl/my-account/api-access" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
              start.bouw7.nl → Mijn account → API-toegang
            </a>
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>App-naam</span>
              <Input name="app_name" type="text" required defaultValue={existingAppName ?? ''}
                placeholder="bv. bouw7" />
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>De applicatienaam waarmee je bij Bouw7 geregistreerd bent</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>API Key</span>
              <Input name="api_key" type="password" required defaultValue={existingKey ?? ''}
                placeholder="Plak hier je API key"
                style={{  }} />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button type="submit" loading={pending}>
              Opslaan
            </Button>

            {existingKey && (
              <Button type="button" variant="ghost" disabled={pending}
                onClick={() => {
                  setStatus({ kind: 'saving' })
                  startTransition(async () => {
                    const r = await testBouw7Connection()
                    if (r.ok) setStatus({ kind: 'success', msg: r.message })
                    else setStatus({ kind: 'error', message: r.error })
                  })
                }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 2 4 11h5l-1 7 7-9h-5l1-7Z"/>
                </svg>
                Verbinding testen
              </Button>
            )}

            {status.kind === 'success' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>
                <CheckIcon /> {status.msg}
              </span>
            )}
            {status.kind === 'error' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 13, color: '#dc2626' }}>
                <WarnIcon /> {status.message}
              </span>
            )}
          </div>

          {laatstSync && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 10 }}>
              Laatst gesynchroniseerd: {new Date(laatstSync).toLocaleString('nl-NL')}
            </p>
          )}
          </CardBody>
        </Card>
      </form>

      {/* Sync sectie */}
      {existingKey && (
        <Card>
          <CardBody>
          <p className="eva-section-label">Synchronisatie</p>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 14 }}>
            Importeer relaties, medewerkers en projecten uit Bouw7 naar het platform. Een incrementele
            sync werkt alleen gewijzigde records bij (snel); een volledige sync haalt alles opnieuw op.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button type="button" loading={syncing}
              onClick={async () => {
                setSyncing(true)
                setSyncResult(null)
                try { setSyncResult(await runFullSync('incremental')) }
                finally { setSyncing(false) }
              }}>
              {!syncing && (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10a7 7 0 0 1 12-5l2 2M17 10a7 7 0 0 1-12 5l-2-2M15 3v4h-4M5 17v-4h4"/>
                </svg>
              )}
              {syncing ? 'Synchroniseren…' : 'Sync starten'}
            </Button>

            <Button type="button" variant="ghost" disabled={syncing}
              onClick={async () => {
                setSyncing(true)
                setSyncResult(null)
                try { setSyncResult(await runFullSync('full')) }
                finally { setSyncing(false) }
              }}>
              Volledige sync
            </Button>
          </div>

          {syncResult && !syncResult.ok && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'color-mix(in srgb, #dc2626 8%, var(--bg-elev))', border: '1px solid color-mix(in srgb, #dc2626 20%, transparent)', borderRadius: 8 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: '#dc2626' }}>{syncResult.error}</span>
            </div>
          )}

          {syncResult?.ok && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
              <SyncCard label="Relaties"     result={{
                nieuw:       syncResult.contacts.organisaties.nieuw      + syncResult.contacts.contactpersonen.nieuw,
                bijgewerkt:  syncResult.contacts.organisaties.bijgewerkt + syncResult.contacts.contactpersonen.bijgewerkt,
                fouten:      syncResult.contacts.organisaties.fouten     + syncResult.contacts.contactpersonen.fouten,
                overgeslagen:(syncResult.contacts.organisaties.overgeslagen ?? 0) + (syncResult.contacts.contactpersonen.overgeslagen ?? 0),
              }} />
              <SyncCard label="Medewerkers"  result={syncResult.employees} />
              <SyncCard label="Projecten"    result={syncResult.projects}  />
            </div>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 10 }}>
              Offerte API diagnose
            </p>
            <Button type="button" variant="ghost" size="sm" loading={quotationDebugging}
              onClick={async () => {
                setQuotationDebugging(true)
                setQuotationDebug(null)
                try { setQuotationDebug(await debugBouw7Quotations()) }
                finally { setQuotationDebugging(false) }
              }}>
              Quotation-endpoint inspecteren
            </Button>
            {quotationDebug && (
              <div style={{
                marginTop: 10, padding: '12px 14px',
                background: quotationDebug.ok ? 'var(--bg)' : 'color-mix(in srgb, #dc2626 8%, var(--bg-elev))',
                border: `1px solid ${quotationDebug.ok ? 'var(--border)' : 'color-mix(in srgb, #dc2626 20%, transparent)'}`,
                borderRadius: 8, fontSize: 11,
              }}>
                {quotationDebug.ok ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--fg)' }}>
                    <div><strong>Endpoint:</strong> {quotationDebug.endpoint}</div>
                    <div><strong>Totaal:</strong> {quotationDebug.totaal} | <strong>Gemapped:</strong> {quotationDebug.gemapped}</div>
                    <div><strong>Velden:</strong> {quotationDebug.velden}</div>
                    <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', color: 'var(--fg-muted)' }}>
                      {JSON.stringify(quotationDebug.sample, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <span style={{ color: '#dc2626' }}>{quotationDebug.error}</span>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 10 }}>
              Project API diagnose
            </p>
            <Button type="button" variant="ghost" size="sm" loading={projectDebugging}
              onClick={async () => {
                setProjectDebugging(true)
                setProjectDebug(null)
                try { setProjectDebug(await debugBouw7Projects()) }
                finally { setProjectDebugging(false) }
              }}>
              Project-endpoint inspecteren
            </Button>
            {projectDebug && (
              <div style={{
                marginTop: 10, padding: '12px 14px',
                background: projectDebug.ok ? 'var(--bg)' : 'color-mix(in srgb, #dc2626 8%, var(--bg-elev))',
                border: `1px solid ${projectDebug.ok ? 'var(--border)' : 'color-mix(in srgb, #dc2626 20%, transparent)'}`,
                borderRadius: 8, fontSize: 11,
              }}>
                {projectDebug.ok ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--fg)' }}>
                    <div><strong>Velden:</strong> {projectDebug.velden}</div>
                    <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflow: 'auto', color: 'var(--fg-muted)' }}>
                      {JSON.stringify(projectDebug.sample, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <span style={{ color: '#dc2626' }}>{projectDebug.error}</span>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Schrijftoegang (fase 0)
            </p>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Toetst of de API-key naar Bouw7 mág schrijven. Veilig: leest de interne notitie van het
              eerste project en schrijft exact dezelfde waarde terug — geen feitelijke wijziging.
            </p>
            <Button type="button" variant="ghost" size="sm" loading={writeChecking}
              onClick={async () => {
                setWriteChecking(true)
                setWriteCheck(null)
                try { setWriteCheck(await verifyBouw7WriteAccess()) }
                finally { setWriteChecking(false) }
              }}>
              Schrijftoegang testen
            </Button>
            {writeCheck && (
              <div style={{
                marginTop: 10, padding: '12px 14px',
                background: writeCheck.ok ? 'color-mix(in srgb, var(--accent) 8%, var(--bg))' : 'color-mix(in srgb, #dc2626 8%, var(--bg-elev))',
                border: `1px solid ${writeCheck.ok ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'color-mix(in srgb, #dc2626 20%, transparent)'}`,
                borderRadius: 8, fontSize: 12,
              }}>
                {writeCheck.ok ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 500 }}>
                    <CheckIcon /> {writeCheck.message}
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dc2626' }}>
                    <WarnIcon /> {writeCheck.error}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Bestelregels — bestaande regels &amp; bewakingscodes ontdekken
            </p>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Read-only. Haalt voor het eerste project de bestaande bestelregels
              (<code>GET /list/contract-order-lines</code>) en de bewakingscodes op, zodat je geldige
              <code> projectSecurityLink</code>-ids ziet om nieuwe regels op te laten landen.
            </p>
            <Button type="button" variant="ghost" size="sm" loading={poRefsLoading}
              onClick={async () => {
                setPoRefsLoading(true)
                setPoRefs(null)
                try { setPoRefs(await discoverBouw7Bestelregels()) }
                finally { setPoRefsLoading(false) }
              }}>
              Bestelregels &amp; bewakingscodes inspecteren
            </Button>
            {poRefs && (
              <div style={{
                marginTop: 10, padding: '12px 14px',
                background: poRefs.ok ? 'var(--bg)' : 'color-mix(in srgb, #dc2626 8%, var(--bg-elev))',
                border: `1px solid ${poRefs.ok ? 'var(--border)' : 'color-mix(in srgb, #dc2626 20%, transparent)'}`,
                borderRadius: 8, fontSize: 11,
              }}>
                {poRefs.ok ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 320, overflow: 'auto', color: 'var(--fg-muted)' }}>
                    {JSON.stringify({ projectId: poRefs.projectId, bestaandeRegels: poRefs.bestaandeRegels, bewakingscodes: poRefs.bewakingscodes }, null, 2)}
                  </pre>
                ) : (
                  <span style={{ color: '#dc2626' }}>{poRefs.error}</span>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Inkooporders &amp; OA-contracten — statussen en voorbeeldcontract ontdekken
            </p>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Read-only. Haalt de statuslijsten en kostentypes op (die id&apos;s mag je niet raden) en van het
              nieuwste bestaande contract per soort het detail plus zijn termijnen — daarin zie je of een termijn
              via <code>contractOrderLines</code> naar bestaande bestelregels verwijst.
            </p>
            <Button type="button" variant="ghost" size="sm" loading={contractRefsLoading}
              onClick={async () => {
                setContractRefsLoading(true)
                setContractRefs(null)
                try { setContractRefs(await discoverBouw7Contracten()) }
                finally { setContractRefsLoading(false) }
              }}>
              Contracten inspecteren
            </Button>
            {contractRefs && (
              <div style={{
                marginTop: 10, padding: '12px 14px',
                background: contractRefs.ok ? 'var(--bg)' : 'color-mix(in srgb, #dc2626 8%, var(--bg-elev))',
                border: `1px solid ${contractRefs.ok ? 'var(--border)' : 'color-mix(in srgb, #dc2626 20%, transparent)'}`,
                borderRadius: 8, fontSize: 11,
              }}>
                {contractRefs.ok ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 320, overflow: 'auto', color: 'var(--fg-muted)' }}>
                    {JSON.stringify(contractRefs, null, 2)}
                  </pre>
                ) : (
                  <span style={{ color: '#dc2626' }}>{contractRefs.error}</span>
                )}
              </div>
            )}
          </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function SyncCard({ label, result }: {
  label: string
  result: { nieuw: number; bijgewerkt: number; fouten: number; overgeslagen?: number; foutMelding?: string }
}) {
  const hasErrors = result.fouten > 0
  return (
    <div style={{
      padding: '12px 14px',
      background: hasErrors ? 'color-mix(in srgb, #dc2626 6%, var(--bg))' : 'var(--bg)',
      border: `1px solid ${hasErrors ? 'color-mix(in srgb, #dc2626 20%, transparent)' : 'var(--border)'}`,
      borderRadius: 8,
    }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-ui)', fontSize: 12 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>+{result.nieuw} nieuw</span>
        <span style={{ color: 'var(--fg-muted)' }}>{result.bijgewerkt} bijgewerkt</span>
        {result.overgeslagen != null && result.overgeslagen > 0 && (
          <span style={{ color: 'var(--fg-muted)' }}>{result.overgeslagen} overgeslagen</span>
        )}
        {hasErrors && <span style={{ color: '#dc2626' }}>{result.fouten} fouten</span>}
      </div>
      {result.foutMelding && (
        <p style={{ marginTop: 4, fontFamily: 'var(--font-ui)', fontSize: 11, color: '#dc2626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={result.foutMelding}>{result.foutMelding}</p>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4 4 8-9"/>
    </svg>
  )
}
function WarnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10 3 2 17h16L10 3ZM10 8v4M10 15v.5"/>
    </svg>
  )
}
