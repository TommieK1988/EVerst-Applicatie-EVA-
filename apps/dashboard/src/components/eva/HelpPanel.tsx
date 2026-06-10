'use client';
import React, { useEffect } from 'react';
import { IconClose } from './Icons';
import type { PageHelp } from '@/lib/page-help';

type Props = {
  open: boolean
  onClose: () => void
  content: PageHelp | null
}

export default function HelpPanel({ open, onClose, content }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.18)',
          zIndex: 999,
        }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 400,
        background: 'var(--bg-elev)',
        borderLeft: '1px solid var(--border)',
        zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em',
              marginBottom: 4,
            }}>Handleiding</div>
            <div style={{
              fontSize: 16, fontWeight: 600,
              color: 'var(--fg)', lineHeight: 1.2,
            }}>{content?.title ?? 'Help'}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 28, height: 28,
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--fg-muted)',
              display: 'grid', placeItems: 'center',
              marginTop: 2,
            }}
            title="Sluiten"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {content ? (
            <>
              <p style={{
                margin: 0,
                fontSize: 13, lineHeight: 1.65,
                color: 'var(--fg-soft)',
              }}>{content.description}</p>

              {content.sections?.map((section) => (
                <div key={section.title}>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: 'var(--fg)', textTransform: 'uppercase',
                    letterSpacing: '0.07em', fontFamily: 'var(--font-mono)',
                    marginBottom: 6,
                  }}>{section.title}</div>
                  <p style={{
                    margin: 0,
                    fontSize: 13, lineHeight: 1.65,
                    color: 'var(--fg-soft)',
                  }}>{section.body}</p>
                </div>
              ))}
            </>
          ) : (
            <p style={{
              margin: 0, fontSize: 13,
              color: 'var(--fg-muted)', fontStyle: 'italic',
            }}>
              Geen handleiding beschikbaar voor deze pagina.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 11, color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            Tip: druk <kbd style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              background: 'var(--bg-active)', border: '1px solid var(--border)',
              borderRadius: 3, padding: '1px 5px',
              color: 'var(--fg-soft)',
            }}>Esc</kbd> om te sluiten
          </div>
        </div>
      </div>
    </>
  )
}
