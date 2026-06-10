import Link from 'next/link'

type Section = { title: string; description: string }

export function PagePlaceholder({
  title,
  kicker,
  intro,
  sections,
}: {
  title: string
  kicker: string
  intro: string
  sections: Section[]
}) {
  return (
    <div className="eva-page">
      <Link href="/" className="eva-back-link">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 4l-6 6 6 6"/>
        </svg>
        Overzicht
      </Link>

      <div className="eva-page-header">
        <p className="eva-page-kicker">{kicker}</p>
        <h1 className="eva-page-title">{title}</h1>
        <p className="eva-page-desc">{intro}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {sections.map((s) => (
          <div key={s.title} className="eva-card">
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)', lineHeight: 1.5, marginBottom: 12 }}>{s.description}</div>
            <span style={{
              display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
              border: '1px solid var(--border)', borderRadius: 3, padding: '2px 6px',
            }}>binnenkort</span>
          </div>
        ))}
      </div>
    </div>
  )
}
