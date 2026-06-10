export default function ProjectplanningLoading() {
  return (
    <div className="eva-page">
      <div style={{ height: 32, width: 220, background: 'var(--bg-active)', borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 18, width: 300, background: 'var(--bg-active)', borderRadius: 4, marginBottom: 28 }} />
      <div style={{ height: 36, width: '100%', maxWidth: 460, background: 'var(--bg-active)', borderRadius: 8, marginBottom: 16 }} />
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ height: 44, background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
            <div style={{ height: 14, width: 120 + (i % 3) * 40, background: 'var(--bg-active)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
