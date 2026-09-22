type Variante = "exito" | "error" | "advertencia"

const estilos: Record<Variante, { fondo: string; borde?: string; texto: string; sombra?: string }> = {
  exito: { fondo: "#fff", texto: "#14171A", sombra: "0 4px 24px rgba(0,0,0,0.12)" },
  error: { fondo: "rgba(220,38,38,0.06)", borde: "1.5px solid rgba(220,38,38,0.25)", texto: "#DC2626" },
  advertencia: { fondo: "rgba(217,119,6,0.08)", borde: "1.5px solid rgba(217,119,6,0.3)", texto: "#7C4A03" },
}

export default function BannerFlotante({
  variante, icono, children, animar,
}: { variante: Variante; icono: React.ReactNode; children: React.ReactNode; animar?: boolean }) {
  const e = estilos[variante]
  return (
    <div style={{
      position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
      background: e.fondo, border: e.borde, boxShadow: e.sombra, borderRadius: 16,
      padding: "16px", textAlign: "center",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      animation: animar ? "fadeIn 0.2s ease" : undefined,
    }}>
      {icono}
      <p style={{ color: e.texto, fontSize: 15, fontWeight: 700, margin: 0 }}>{children}</p>
    </div>
  )
}
