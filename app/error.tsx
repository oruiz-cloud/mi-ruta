"use client"

import { IconoAlerta, Insignia } from "@/components/Iconos"

const INK = "#14171A"
const INK_SUAVE = "#5C6470"
const PELIGRO = "#DC2626"

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ height: "100dvh", background: "#FAFAF8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
      <Insignia tamano={100} colorFondo="rgba(220,38,38,0.1)" colorAcento={PELIGRO}>
        <IconoAlerta size={44} color={PELIGRO} strokeWidth={1.75} />
      </Insignia>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: INK, marginBottom: 12, letterSpacing: -0.5 }}>
        Algo salió mal
      </h1>
      <p style={{ fontSize: 16, color: INK_SUAVE, lineHeight: 1.6, marginBottom: 40, maxWidth: 280 }}>
        Tuvimos un problema mostrando Mi Ruta. Intentá de nuevo.
      </p>
      <button
        onClick={reset}
        style={{
          width: "100%", padding: "22px", borderRadius: 16, border: "none",
          background: "#0E9F6E", color: "#fff", fontSize: 18, fontWeight: 700,
          cursor: "pointer", boxShadow: "0 4px 14px rgba(14,159,110,0.3)",
        }}
      >
        Reintentar
      </button>
    </main>
  )
}
