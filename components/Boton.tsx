type Variante = "primaria" | "secundaria" | "contorno" | "texto" | "advertencia"
type Tamano = "grande" | "mediano" | "chico"

type Props = {
  onClick?: () => void
  disabled?: boolean
  variante?: Variante
  tamano?: Tamano
  full?: boolean
  flex?: number
  children: React.ReactNode
}

const estilosVariante: Record<Variante, React.CSSProperties> = {
  primaria: { background: "#0E9F6E", color: "#fff", border: "none", boxShadow: "0 4px 14px rgba(14,159,110,0.3)" },
  secundaria: { background: "#fff", color: "#5C6470", border: "1.5px solid #E4E4E0" },
  contorno: { background: "#fff", color: "#0E9F6E", border: "2px solid #0E9F6E" },
  texto: { background: "none", color: "#0E9F6E", border: "none" },
  advertencia: { background: "#D97706", color: "#fff", border: "none" },
}

const estilosTamano: Record<Tamano, React.CSSProperties> = {
  grande: { padding: "22px", fontSize: 18, borderRadius: 16, fontWeight: 700, letterSpacing: -0.3 },
  mediano: { padding: "20px", fontSize: 16, borderRadius: 16, fontWeight: 700 },
  chico: { padding: "10px 20px", fontSize: 14, borderRadius: 12, fontWeight: 700 },
}

export default function Boton({ onClick, disabled, variante = "primaria", tamano = "grande", full = true, flex, children }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...estilosVariante[variante],
        ...estilosTamano[tamano],
        width: full ? "100%" : undefined,
        flex,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}
    >
      {children}
    </button>
  )
}
