"use client"

import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import { RUTAS } from "@/lib/rutas"
import { supabase } from "@/lib/supabase"
import { Reporte, Ruta } from "@/types"

const MapaLeaflet = dynamic(() => import("@/components/MapaLeaflet"), { ssr: false })

type Modo = "idle" | "en_bus" | "esperando"
type EstadoReporte = "idle" | "cargando" | "activo" | "sin_conexion"

const ONBOARDING_KEY = "mi_ruta_onboarding_visto"
const REPORTE_KEY = "mi_ruta_reporte_activo"
const TIMEOUT_REPORTE = 20 * 60 * 1000
const TIMEOUT_GPS = 30 * 60 * 1000
const MAX_INTENTOS = 3
const INTERVALO_REINTENTO = 30000
const ITEM_HEIGHT = 80

export default function Home() {
  const [onboardingVisto, setOnboardingVisto] = useState(true)
  const [onboardingPaso, setOnboardingPaso] = useState(0)
  const [modo, setModo] = useState<Modo>("idle")
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [rutaSeleccionada, setRutaSeleccionada] = useState<Ruta | null>(null)
  const [indiceRuta, setIndiceRuta] = useState(0)
  const [estadoReporte, setEstadoReporte] = useState<EstadoReporte>("idle")
  const [reporteActivo, setReporteActivo] = useState<Reporte | null>(null)
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [miPosicion, setMiPosicion] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsPermiso, setGpsPermiso] = useState<"pendiente" | "ok" | "denegado">("pendiente")
  const [confirmacionVisible, setConfirmacionVisible] = useState(false)
  const [ultimaActividad, setUltimaActividad] = useState(Date.now())
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startIndex = useRef(0)

  useEffect(() => {
    if (!navigator.geolocation) { setGpsPermiso("denegado"); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMiPosicion({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsPermiso("ok") },
      () => setGpsPermiso("denegado")
    )
  }, [])

  useEffect(() => {
    const visto = localStorage.getItem(ONBOARDING_KEY)
    if (!visto) setOnboardingVisto(false)
  }, [])

  useEffect(() => {
    const raw = localStorage.getItem(REPORTE_KEY)
    if (!raw) return
    const r: Reporte = JSON.parse(raw)
    if (Date.now() - r.timestamp < TIMEOUT_REPORTE) {
      setReporteActivo(r)
      setEstadoReporte("activo")
      setModo(r.tipo === "en_bus" ? "en_bus" : "esperando")
    } else {
      localStorage.removeItem(REPORTE_KEY)
    }
  }, [])

  useEffect(() => {
    const cargarReportes = async () => {
      const { data, error } = await supabase.from("reportes").select("*").gt("timestamp", Date.now() - TIMEOUT_REPORTE)
      if (!error && data) setReportes(data.map(mapearReporte))
    }
    cargarReportes()
    const canal = supabase.channel("reportes_tiempo_real")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reportes" },
        (payload) => setReportes(prev => [...prev, mapearReporte(payload.new)])
      ).subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  useEffect(() => {
    if (estadoReporte !== "activo") return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nuevaPosicion = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMiPosicion(nuevaPosicion)
        if (Date.now() - ultimaActividad > TIMEOUT_GPS) { cancelarReporte(); return }
        setReporteActivo(prev => {
          if (!prev) return prev
          const actualizado = { ...prev, ...nuevaPosicion, timestamp: Date.now() }
          localStorage.setItem(REPORTE_KEY, JSON.stringify(actualizado))
          return actualizado
        })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [estadoReporte, ultimaActividad])

  useEffect(() => {
    const actualizar = () => setUltimaActividad(Date.now())
    window.addEventListener("touchstart", actualizar)
    window.addEventListener("click", actualizar)
    return () => { window.removeEventListener("touchstart", actualizar); window.removeEventListener("click", actualizar) }
  }, [])

  function mapearReporte(r: any): Reporte {
    return { id: r.id.toString(), rutaId: r.ruta_id, rutaNombre: r.ruta_nombre, rutaColor: r.ruta_color, tipo: r.tipo, lat: r.lat, lng: r.lng, timestamp: r.timestamp, trazas: [] }
  }

  function mostrarConfirmacion() {
    setConfirmacionVisible(true)
    setTimeout(() => setConfirmacionVisible(false), 2000)
  }

  function conteoActivos(rutaId: string) {
    return reportes.filter(r => r.rutaId === rutaId && Date.now() - r.timestamp < TIMEOUT_REPORTE).length
  }

  function abrirPicker(m: Modo) {
    setModo(m)
    setPickerAbierto(true)
  }

  function onTouchStart(e: React.TouchEvent) {
    isDragging.current = true
    startY.current = e.touches[0].clientY
    startIndex.current = indiceRuta
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return
    const delta = startY.current - e.touches[0].clientY
    const newIndex = Math.round(startIndex.current + delta / ITEM_HEIGHT)
    setIndiceRuta(Math.max(0, Math.min(RUTAS.length - 1, newIndex)))
  }

  function onTouchEnd() {
    isDragging.current = false
  }

  async function confirmarRuta() {
    const ruta = RUTAS[indiceRuta]
    setRutaSeleccionada(ruta)
    setPickerAbierto(false)
    setEstadoReporte("cargando")

    const publicar = async (pos: GeolocationPosition) => {
      const tipo = modo === "en_bus" ? "en_bus" : "esperando"
      const timestamp = Date.now()
      const { data, error } = await supabase.from("reportes").insert({
        ruta_id: ruta.id, ruta_nombre: ruta.nombre, ruta_color: ruta.color,
        tipo, lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp,
      }).select().single()

      if (error || !data) { setEstadoReporte("sin_conexion"); return }

      const reporte: Reporte = {
        id: data.id.toString(), rutaId: ruta.id, rutaNombre: ruta.nombre,
        rutaColor: ruta.color, tipo, lat: pos.coords.latitude,
        lng: pos.coords.longitude, timestamp, trazas: [],
      }
      localStorage.setItem(REPORTE_KEY, JSON.stringify(reporte))
      setReporteActivo(reporte)
      setEstadoReporte("activo")
      if (modo === "en_bus") mostrarConfirmacion()
    }

    let intentos = 0
    const intentar = () => {
      navigator.geolocation.getCurrentPosition(publicar, () => {
        intentos++
        if (intentos < MAX_INTENTOS) setTimeout(intentar, INTERVALO_REINTENTO)
        else setEstadoReporte("sin_conexion")
      })
    }
    intentar()
  }

  async function subirAlBus() {
    if (!reporteActivo) return
    const actualizado: Reporte = { ...reporteActivo, tipo: "en_bus", timestamp: Date.now() }
    await supabase.from("reportes").update({ tipo: "en_bus", timestamp: actualizado.timestamp }).eq("id", reporteActivo.id)
    localStorage.setItem(REPORTE_KEY, JSON.stringify(actualizado))
    setReporteActivo(actualizado)
    setModo("en_bus")
    mostrarConfirmacion()
  }

  function cancelarReporte() {
    localStorage.removeItem(REPORTE_KEY)
    setReporteActivo(null)
    setEstadoReporte("idle")
    setModo("idle")
    setRutaSeleccionada(null)
  }

  function terminarOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "1")
    setOnboardingVisto(true)
  }

  if (gpsPermiso === "denegado") {
    return (
      <main style={{ height: "100dvh", background: "#F8F9FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
        <Image src="/logo.svg" alt="Mi Ruta" width={80} height={80} style={{ marginBottom: 24, opacity: 0.5 }} loading="eager" />
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Necesitamos tu ubicación</h1>
        <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.6, marginBottom: 32 }}>
          Mi Ruta funciona con GPS. Activá el permiso de ubicación en tu navegador y recargá la página.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 16, padding: "18px 32px", fontSize: 17, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}
        >
          Ya lo activé — recargar
        </button>
      </main>
    )
  }

  if (!onboardingVisto) {
    const pasos = [
      { emoji: "🚌", titulo: "Reportá dónde vas", texto: "Decinos si estás en el bus o esperando uno. Solo toma dos toques." },
      { emoji: "📍", titulo: "Ayudá a los demás", texto: "Tu ubicación aparece en el mapa para que otros sepan dónde va el bus." },
      { emoji: "🗺️", titulo: "Todos ganamos", texto: "Mientras más personas reporten, mejor información tenemos todos. Es gratis." },
    ]
    const paso = pasos[onboardingPaso]
    return (
      <main style={{ height: "100dvh", background: "#F8F9FA", display: "flex", flexDirection: "column", padding: "48px 32px 40px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <Image src="/logo.svg" alt="Mi Ruta" width={120} height={120} style={{ marginBottom: 24 }} loading="eager" />
          <div style={{ fontSize: 44, marginBottom: 16 }}>{paso.emoji}</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#111827", marginBottom: 12, letterSpacing: -0.5 }}>{paso.titulo}</h1>
          <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.6, marginBottom: 32, maxWidth: 280 }}>{paso.texto}</p>
          <div style={{ display: "flex", gap: 8 }}>
            {pasos.map((_, i) => (
              <div key={i} style={{
                height: 8, borderRadius: 4,
                background: i === onboardingPaso ? "#2563eb" : "#E5E7EB",
                width: i === onboardingPaso ? 28 : 8,
                transition: "all 0.3s"
              }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {onboardingPaso < pasos.length - 1 ? (
            <button
              onClick={() => setOnboardingPaso(p => p + 1)}
              style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 16, padding: "20px", fontSize: 17, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={terminarOnboarding}
              style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 16, padding: "20px", fontSize: 17, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}
            >
              Empezar
            </button>
          )}
          <button onClick={terminarOnboarding} style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: 15, cursor: "pointer", padding: "10px" }}>
            Saltar
          </button>
        </div>
      </main>
    )
  }

  const reportesFiltrados = modo === "esperando" && rutaSeleccionada
    ? reportes.filter(r => r.rutaId === rutaSeleccionada.id && r.tipo === "en_bus")
    : []

  return (
    <main style={{ height: "100dvh", background: "#F8F9FA", display: "flex", flexDirection: "column" }}>

      {/* Mapa */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, borderRadius: "0 0 28px 28px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
        {gpsPermiso === "ok" && (
          <MapaLeaflet reportes={reportesFiltrados} miPosicion={miPosicion} reporteActivo={reporteActivo} />
        )}

        <div style={{ position: "absolute", top: 16, left: 16, zIndex: 999, pointerEvents: "none", filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.2))" }}>
          <Image src="/icono.svg" alt="Mi Ruta" width={44} height={44} loading="eager" />
        </div>

        {estadoReporte === "activo" && reporteActivo && (
          <div style={{
            position: "absolute", top: 16, left: 68, right: 16, zIndex: 1000,
            background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)",
            borderRadius: 14, padding: "12px 16px",
            display: "flex", alignItems: "center",
            boxShadow: "0 2px 16px rgba(0,0,0,0.1)"
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              backgroundColor: "#2563eb",
              animation: "pulso 1.5s ease-in-out infinite",
              marginRight: 10, flexShrink: 0,
            }} />
            <span style={{ fontSize: 15, color: "#111827", fontWeight: 600 }}>
              {reporteActivo.tipo === "en_bus" ? "Reportando" : "Esperando"} · {reporteActivo.rutaNombre}
              {reporteActivo.tipo === "esperando" && reportesFiltrados.length === 0 && (
                <span style={{ color: "#9CA3AF", fontSize: 13, fontWeight: 400 }}> · Sin actividad</span>
              )}
            </span>
          </div>
        )}

        {confirmacionVisible && (
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
            background: "#fff", borderRadius: 16, padding: "18px",
            textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            animation: "fadeIn 0.2s ease"
          }}>
            <p style={{ color: "#111827", fontSize: 16, fontWeight: 700, margin: 0 }}>✅ Reporte publicado</p>
          </div>
        )}

        {estadoReporte === "sin_conexion" && (
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
            background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 16,
            padding: "16px", textAlign: "center"
          }}>
            <p style={{ color: "#DC2626", fontSize: 15, fontWeight: 600, margin: 0 }}>Sin conexión. Tu reporte no está activo.</p>
          </div>
        )}
      </div>

      {/* Botones */}
      <div style={{ flexShrink: 0, padding: "20px 20px 36px", display: "flex", flexDirection: "column", gap: 12 }}>
        {estadoReporte === "activo" && reporteActivo?.tipo === "esperando" ? (
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={cancelarReporte}
              style={{ flex: 1, padding: "20px", borderRadius: 16, border: "1.5px solid #E5E7EB", background: "#fff", color: "#6B7280", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={subirAlBus}
              style={{ flex: 1, padding: "20px", borderRadius: 16, border: "none", background: "#2563eb", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}
            >
              ✓ Ya subí
            </button>
          </div>
        ) : estadoReporte === "activo" && reporteActivo?.tipo === "en_bus" ? (
          <button
            onClick={cancelarReporte}
            style={{ width: "100%", padding: "20px", borderRadius: 16, border: "1.5px solid #E5E7EB", background: "#fff", color: "#6B7280", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
          >
            Cancelar reporte
          </button>
        ) : (
          <>
            <button
              onClick={() => abrirPicker("en_bus")}
              disabled={estadoReporte === "cargando"}
              style={{
                width: "100%", padding: "22px", borderRadius: 16, border: "none",
                background: "#2563eb", color: "#fff", fontSize: 18, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
                opacity: estadoReporte === "cargando" ? 0.6 : 1, letterSpacing: -0.3,
              }}
            >
              {estadoReporte === "cargando" && modo === "en_bus" ? "Publicando..." : "Estoy en el bus"}
            </button>
            <button
              onClick={() => abrirPicker("esperando")}
              disabled={estadoReporte === "cargando"}
              style={{
                width: "100%", padding: "22px", borderRadius: 16,
                border: "2px solid #2563eb", background: "#fff",
                color: "#2563eb", fontSize: 18, fontWeight: 700,
                cursor: "pointer", letterSpacing: -0.3,
                opacity: estadoReporte === "cargando" ? 0.6 : 1,
              }}
            >
              {estadoReporte === "cargando" && modo === "esperando" ? "Publicando..." : "Espero el bus"}
            </button>
          </>
        )}
      </div>

      {/* Picker ruleta */}
      {pickerAbierto && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setPickerAbierto(false)}
        >
          <div
            style={{ width: "100%", background: "#fff", borderRadius: "28px 28px 0 0", paddingBottom: 40 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 44, height: 5, background: "#E5E7EB", borderRadius: 3, margin: "16px auto 20px" }} />

            <p style={{ textAlign: "center", fontSize: 22, color: "#111827", margin: "0 0 6px", fontWeight: 700, letterSpacing: -0.5 }}>
              {modo === "en_bus" ? "¿En qué bus vas?" : "¿Qué bus esperás?"}
            </p>
            <p style={{ textAlign: "center", fontSize: 15, color: "#9CA3AF", margin: "0 0 16px", fontWeight: 400 }}>
              Deslizá para seleccionar
            </p>

            <div style={{ position: "relative", height: ITEM_HEIGHT * 5, overflow: "hidden", userSelect: "none" }}>
              <div style={{
                position: "absolute", top: "50%", left: 20, right: 20,
                transform: "translateY(-50%)", height: ITEM_HEIGHT,
                borderTop: "2.5px solid #2563eb", borderBottom: "2.5px solid #2563eb",
                borderRadius: 14, background: "rgba(37,99,235,0.06)",
                pointerEvents: "none", zIndex: 10,
              }} />

              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: ITEM_HEIGHT * 2,
                background: "linear-gradient(to bottom, rgba(255,255,255,1), rgba(255,255,255,0))",
                pointerEvents: "none", zIndex: 5,
              }} />
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_HEIGHT * 2,
                background: "linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0))",
                pointerEvents: "none", zIndex: 5,
              }} />

              <div
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{
                  position: "absolute", top: 0, left: 0, right: 0,
                  transform: `translateY(${(2 - indiceRuta) * ITEM_HEIGHT}px)`,
                  transition: isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                }}
              >
                {RUTAS.map((ruta, i) => {
                  const distancia = Math.abs(i - indiceRuta)
                  const activos = conteoActivos(ruta.id)
                  return (
                    <div
                      key={ruta.id}
                      style={{
                        height: ITEM_HEIGHT,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 10,
                        opacity: distancia === 0 ? 1 : distancia === 1 ? 0.45 : 0.15,
                        transform: `scale(${distancia === 0 ? 1 : distancia === 1 ? 0.85 : 0.7})`,
                        transition: "all 0.25s",
                      }}
                    >
                      <span style={{
                        fontSize: distancia === 0 ? 44 : 20,
                        fontWeight: 700,
                        color: distancia === 0 ? "#2563eb" : "#9CA3AF",
                        letterSpacing: -1,
                        transition: "all 0.25s",
                      }}>
                        {ruta.id}
                      </span>
                      {activos > 0 && distancia === 0 && (
                        <span style={{
                          fontSize: 13, color: "#2563eb", fontWeight: 600,
                          background: "rgba(37,99,235,0.1)", padding: "4px 10px", borderRadius: 20
                        }}>
                          {activos} activo{activos > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ padding: "16px 20px 0" }}>
              <button
                onClick={confirmarRuta}
                style={{
                  width: "100%", padding: "22px", borderRadius: 16, border: "none",
                  background: "#2563eb", color: "#fff", fontSize: 18, fontWeight: 700,
                  cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
                  letterSpacing: -0.3,
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulso {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </main>
  )
}