type Props = {
  size?: number
  color?: string
  strokeWidth?: number
}

const base = (strokeWidth: number) => ({
  fill: "none" as const,
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
})

export function IconoBus({ size = 40, color = "currentColor", strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base(strokeWidth)}>
      <rect x="3" y="7" width="18" height="11" rx="3" />
      <path d="M3 12h18" />
      <path d="M8 7v5" />
      <path d="M16 7v5" />
      <circle cx="7.5" cy="19" r="1.6" fill={color} stroke="none" />
      <circle cx="16.5" cy="19" r="1.6" fill={color} stroke="none" />
    </svg>
  )
}

export function IconoPin({ size = 40, color = "currentColor", strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base(strokeWidth)}>
      <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z" />
      <circle cx="12" cy="9" r="2.75" fill={color} stroke="none" />
    </svg>
  )
}

export function IconoPinBloqueado({ size = 40, color = "currentColor", strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base(strokeWidth)}>
      <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z" />
      <circle cx="12" cy="9" r="2.75" fill={color} stroke="none" />
      <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" />
    </svg>
  )
}

export function IconoRed({ size = 40, color = "currentColor", strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base(strokeWidth)}>
      <path d="M7.6 15.8 10.6 8.2M16.4 15.8 13.4 8.2M8.3 17h7.4" />
      <circle cx="6" cy="17" r="2.25" fill={color} stroke="none" />
      <circle cx="18" cy="17" r="2.25" fill={color} stroke="none" />
      <circle cx="12" cy="6" r="2.25" fill={color} stroke="none" />
    </svg>
  )
}

export function IconoCheck({ size = 40, color = "currentColor", strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base(strokeWidth)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5 5.5-6" />
    </svg>
  )
}

export function IconoReloj({ size = 40, color = "currentColor", strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base(strokeWidth)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function IconoAlerta({ size = 40, color = "currentColor", strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base(strokeWidth)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16" r="0.9" fill={color} stroke="none" />
    </svg>
  )
}

// Insignia circular con un pequeño acento asimétrico, para dar más personalidad
// que un círculo plano centrado (patrón usado en onboarding y pantallas de estado).
export function Insignia({
  children, tamano = 112, colorFondo, colorAcento,
}: { children: React.ReactNode; tamano?: number; colorFondo: string; colorAcento: string }) {
  return (
    <div style={{ position: "relative", width: tamano, height: tamano, marginBottom: 28 }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%", background: colorFondo,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {children}
      </div>
      <div style={{
        position: "absolute", top: -4, right: -2, width: tamano * 0.22, height: tamano * 0.22,
        borderRadius: "50%", background: colorAcento,
      }} />
    </div>
  )
}
