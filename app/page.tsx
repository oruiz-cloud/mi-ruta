"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { RUTAS } from "@/lib/rutas"
import { Reporte, Ruta } from "@/types"

const MapaLeaflet = dynamic(() => import("@/components/MapaLeaflet"), { ssr: false })

type Modo = "idle" | "en_bus" | "esperando"
type EstadoReporte = "idle" | "cargando" | "activo" | "error" | "sin_conexion"

const ONBOARDING_KEY = "mi_ruta_onboarding_visto"
const REPORTE_KEY = "mi_ruta_reporte_activo"
const REPORTES_KEY = "mi_ruta_reportes"
const TIMEOUT_REPORTE = 20 * 60 * 1000
const TIMEOUT_GPS = 30 * 60 * 1000

export default function Home() {
  const [onboardingVisto, setOnboardingVisto] = useState(true)
  const [onboardingPaso, setOnboardingPaso] = useState(0)
  const [modo, setModo] = useState<Modo>("idle")
  const [desplegableAbierto, setDesplegableAbierto] = useState(false)
  const [rutaSeleccionada, setRutaSeleccionada] = useState<Ruta | null>(null)
  const [estadoReporte, setEstadoReporte] = useState<EstadoReporte>("idle")
  const [reporteActivo, setReporteActivo] = useState<Reporte | null>(null)
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [miPosicion, setMiPosicion] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsPermiso, setGpsPermiso] = useState<"pendiente" | "ok" | "denegado">("pendiente")
  const [confirmacionVisible, setConfirmacionVisible] = useState(false)
  const [ultimaActividad, setUltimaActividad] = useState(Date.now())

  useEffect(() => {
    if (!navigator.geolocation) { setGpsPermiso("denegado"); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMiPosicion({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsPermiso("ok")
      },
      () => setGpsPermiso("denegado")
    )
  }, [])

  useEffect(() => {
    const visto = localStorage.getItem(ONBOARDING_KEY)
    if (!visto) setOnboardingVisto(false)
  }, [])

  useEffect(() => {
    const raw = localStorage.getItem(REPORTES_KEY)
    if (raw) {
      const todos: Reporte[] = JSON.parse(raw)
      const vigentes = todos.filter(r => Date.now() - r.timestamp < TIMEOUT_REPORTE)
      setReportes(vigentes)
      localStorage.setItem(REPORTES_KEY, JSON.stringify(vigentes))
    }
    const rawActivo = localStorage.getItem(REPORTE_KEY)
    if (rawActivo) {
      const r: Reporte = JSON.parse(rawActivo)
      if (Date.now() - r.timestamp < TIMEOUT_REPORTE) {
        setReporteActivo(r)
        setEstadoReporte("activo")
        setModo(r.tipo === "en_bus" ? "en_bus" : "esperando")
      } else {
        localStorage.removeItem(REPORTE_KEY)
      }
    }
  }, [])

  useEffect(() => {
    if (estadoReporte !== "activo") return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nuevaPosicion = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMiPosicion(nuevaPosicion)
        if (Date.now() - ultimaActividad > TIMEOUT_GPS) {
          cancelarReporte()
          return
        }
        setReporteActivo(prev => {
          if (!prev) return prev
          const actualizado = { ...prev, lat: nuevaPosicion.lat, lng: nuevaPosicion.lng, timestamp: Date.now() }
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
    return () => {
      window.removeEventListener("touchstart", actualizar)
      window.removeEventListener("click", actualizar)
    }
  }, [])

  function abrirDesplegable(m: Modo) {
    setModo(m)
    setDesplegableAbierto(true)
  }

  function conteoActivos(rutaId: string) {
    return reportes.filter(r => r.rutaId === rutaId && Date.now() - r.timestamp < TIMEOUT_REPORTE).length
  }

  async function confirmarRuta(ruta: Ruta) {
    setRutaSeleccionada(ruta)
    setDesplegableAbierto(false)
    setEstadoReporte("cargando")

    const publicar = (pos: GeolocationPosition) => {
      const reporte: Reporte = {
        id: crypto.randomUUID(),
        rutaId: ruta.id,
        rutaNombre: ruta.nombre,
        rutaColor: ruta.color,
        tipo: modo === "en_bus" ? "en_bus" : "esperando",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        timestamp: Date.now(),
        trazas: [],
      }
      const previos: Reporte[] = JSON.parse(localStorage.getItem(REPORTES_KEY) ?? "[]")
      localStorage.setItem(REPORTES_KEY, JSON.stringify([...previos, reporte]))
      localStorage.setItem(REPORTE_KEY, JSON.stringify(reporte))
      setReporteActivo(reporte)
      setReportes(prev => [...prev, reporte])
      setEstadoReporte("activo")
      if (modo === "en_bus") {
        setConfirmacionVisible(true)
        setTimeout(() => setConfirmacionVisible(false), 2000)
      }
    }

    let intentos = 0
    const intentar = () => {
      navigator.geolocation.getCurrentPosition(
        publicar,
        () => {
          intentos++
          if (intentos < 3) setTimeout(intentar, 30000)
          else setEstadoReporte("sin_conexion")
        }
      )
    }
    intentar()
  }

  function subirAlBus() {
    if (!reporteActivo || !rutaSeleccionada) return
    const actualizado: Reporte = {
      ...reporteActivo,
      tipo: "en_bus",
      timestamp: Date.now(),
    }
    const todos: Reporte[] = JSON.parse(localStorage.getItem(REPORTES_KEY) ?? "[]")
    const actualizados = todos.map(r => r.id === actualizado.id ? actualizado : r)
    localStorage.setItem(REPORTES_KEY, JSON.stringify(actualizados))
    localStorage.setItem(REPORTE_KEY, JSON.stringify(actualizado))
    setReporteActivo(actualizado)
    setModo("en_bus")
    setConfirmacionVisible(true)
    setTimeout(() => setConfirmacionVisible(false), 2000)
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
      <main className="h-full bg-zinc-950 text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">📍</div>
        <h1 className="text-xl font-bold mb-2">Necesitamos tu ubicación</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Mi Ruta funciona con GPS. Activa el permiso de ubicación en tu navegador y recarga la página.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-3 rounded-xl bg-white text-zinc-950 font-semibold text-sm"
        >
          Ya lo activé — recargar
        </button>
      </main>
    )
  }

  if (!onboardingVisto) {
    const pasos = [
      { emoji: "🚌", titulo: "Reporta dónde vas", texto: "Dinos si estás en el bus o esperando uno. Solo toma dos toques." },
      { emoji: "📍", titulo: "Ayuda a los demás", texto: "Tu ubicación aparece en el mapa para que otros sepan dónde va el bus." },
      { emoji: "🗺️", titulo: "Todos ganamos", texto: "Mientras más personas reporten, mejor información tenemos todos. Es gratis." },
    ]
    const paso = pasos[onboardingPaso]
    return (
      <main className="h-full bg-zinc-950 text-white flex flex-col px-8 pt-16 pb-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-6">{paso.emoji}</div>
          <h1 className="text-2xl font-bold mb-3">{paso.titulo}</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-10">{paso.texto}</p>
          <div className="flex gap-2">
            {pasos.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === onboardingPaso ? "bg-white" : "bg-zinc-700"}`} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {onboardingPaso < pasos.length - 1 ? (
            <button
              onClick={() => setOnboardingPaso(p => p + 1)}
              className="w-full py-4 rounded-2xl bg-white text-zinc-950 font-bold text-base"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={terminarOnboarding}
              className="w-full py-4 rounded-2xl bg-white text-zinc-950 font-bold text-base"
            >
              Empezar
            </button>
          )}
          <button onClick={terminarOnboarding} className="w-full py-2 text-zinc-600 text-sm underline underline-offset-2">
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
    <main className="h-full bg-zinc-950 flex flex-col" style={{ height: "100dvh" }}>

      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {gpsPermiso === "ok" && (
          <MapaLeaflet
            reportes={reportesFiltrados}
            miPosicion={miPosicion}
            reporteActivo={reporteActivo}
          />
        )}

        {estadoReporte === "activo" && reporteActivo && (
          <div style={{
            position: "absolute", top: 16, left: 16, right: 16, zIndex: 1000,
            background: "rgba(9,9,11,0.85)", backdropFilter: "blur(8px)",
            border: `1px solid ${reporteActivo.rutaColor}`,
            borderRadius: 16, padding: "10px 14px",
            display: "flex", alignItems: "center",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              backgroundColor: reporteActivo.rutaColor,
              animation: "pulso 1.5s ease-in-out infinite",
              marginRight: 8, flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, color: "#fff" }}>
              {reporteActivo.tipo === "en_bus" ? "Reportando" : "Esperando"} · {reporteActivo.rutaNombre?.split("—")[0].trim()}
              {reporteActivo.tipo === "esperando" && reportesFiltrados.length === 0 && (
                <span style={{ color: "#71717a", fontSize: 11 }}> · Sin actividad</span>
              )}
            </span>
          </div>
        )}

        {confirmacionVisible && (
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
            background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 16, padding: "14px 16px", textAlign: "center",
          }}>
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>
              ✅ Tu reporte fue publicado
            </p>
          </div>
        )}

        {estadoReporte === "sin_conexion" && (
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
            background: "rgba(9,9,11,0.9)", border: "1px solid #ef4444",
            borderRadius: 16, padding: "14px 16px", textAlign: "center",
          }}>
            <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>
              Sin conexión. Tu reporte no está activo.
            </p>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 pb-6 pt-4 flex flex-col gap-3">
        {estadoReporte === "activo" && reporteActivo?.tipo === "esperando" ? (
          <div className="flex gap-3">
            <button
              onClick={cancelarReporte}
              className="flex-1 py-4 rounded-2xl font-bold text-base"
              style={{ background: "#27272a", color: "#a1a1aa" }}
            >
              Cancelar
            </button>
            <button
              onClick={subirAlBus}
              className="flex-1 py-4 rounded-2xl font-bold text-base"
              style={{ background: "#2563eb", color: "#fff" }}
            >
              ✓ Ya subí
            </button>
          </div>
        ) : estadoReporte === "activo" && reporteActivo?.tipo === "en_bus" ? (
          <button
            onClick={cancelarReporte}
            className="w-full py-4 rounded-2xl font-bold text-base"
            style={{ background: "#27272a", color: "#a1a1aa" }}
          >
            Cancelar reporte
          </button>
        ) : (
          <>
            <button
              onClick={() => abrirDesplegable("en_bus")}
              disabled={estadoReporte === "cargando"}
              className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-40"
              style={{ background: "#2563eb", color: "#fff" }}
            >
              {estadoReporte === "cargando" && modo === "en_bus" ? "Publicando..." : "Estoy en el bus"}
            </button>
            <button
              onClick={() => abrirDesplegable("esperando")}
              disabled={estadoReporte === "cargando"}
              className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-40"
              style={{ background: "#16a34a", color: "#fff" }}
            >
              {estadoReporte === "cargando" && modo === "esperando" ? "Publicando..." : "Espero el bus"}
            </button>
          </>
        )}
      </div>

      {desplegableAbierto && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "flex-end",
        }}
          onClick={() => setDesplegableAbierto(false)}
        >
          <div
            style={{
              width: "100%", background: "#18181b",
              borderRadius: "24px 24px 0 0", padding: "24px 16px 40px",
              maxHeight: "80vh", overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16, textAlign: "center" }}>
              {modo === "en_bus" ? "¿En qué bus vas?" : "¿Qué bus esperas?"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {RUTAS.map(ruta => {
                const activos = conteoActivos(ruta.id)
                return (
                  <button
                    key={ruta.id}
                    onClick={() => confirmarRuta(ruta)}
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "14px 16px", borderRadius: 14,
                      background: "#09090b", border: "1px solid #3f3f46",
                      color: "#fff", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 12,
                    }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: ruta.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, flex: 1 }}>{ruta.nombre}</span>
                    {activos > 0 && (
                      <span style={{ fontSize: 12, color: ruta.color, fontWeight: 600 }}>
                        {activos} activo{activos > 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulso {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>

    </main>
  )
}