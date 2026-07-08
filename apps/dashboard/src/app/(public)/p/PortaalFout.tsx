export function PortaalFout({ melding }: { melding: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e8e7', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Link niet geldig</h1>
      <p style={{ fontSize: 13.5, color: '#6b757c', margin: 0 }}>{melding}</p>
      <p style={{ fontSize: 12.5, color: '#8a938f', marginTop: 12 }}>
        Neem contact op met Everts als u denkt dat dit niet klopt.
      </p>
    </div>
  )
}
