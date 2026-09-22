import Link from "next/link"
import { IconoPin, Insignia } from "@/components/Iconos"

const INK = "#14171A"
const INK_SUAVE = "#5C6470"
const ACENTO = "#0E9F6E"

export default function NotFound() {
  return (
    <main style={{ height: "100dvh", background: "#FAFAF8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
      <Insignia tamano={100} colorFondo="rgba(14,159,110,0.1)" colorAcento={ACENTO}>
        <IconoPin size={44} color={ACENTO} strokeWidth={1.75} />
      </Insignia>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: INK, marginBottom: 12, letterSpacing: -0.5 }}>
        Página no encontrada
      </h1>
      <p style={{ fontSize: 16, color: INK_SUAVE, lineHeight: 1.6, marginBottom: 40, maxWidth: 280 }}>
        Esta dirección no existe en Mi Ruta.
      </p>
      <Link
        href="/"
        style={{
          width: "100%", padding: "22px", borderRadius: 16, border: "none",
          background: ACENTO, color: "#fff", fontSize: 18, fontWeight: 700,
          textDecoration: "none", boxShadow: "0 4px 14px rgba(14,159,110,0.3)",
        }}
      >
        Volver al inicio
      </Link>
    </main>
  )
}
