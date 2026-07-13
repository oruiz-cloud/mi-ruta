"use client"

import { useState, useEffect } from "react"
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

  // GPS inicial
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

  // Onboarding primera vez
  useEffect(() => {
    const visto = localStorage.getItem(ONBOARDING_KEY)
    if (!visto) setOnboardingVisto(false)
  }, [])

  // Reporte activo propio
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

  // Reportes desde Supabase + tiempo real
  useEffect(() => {
    const cargarReportes = async () => {
      const { data, error } = await supabase
        .from("reportes")
        .select("*")
        .gt("timestamp", Date.now() - TIMEOUT_REPORTE)

      if (!error && data) {
        setReportes(data.map(mapearReporte))
      }
    }

    cargarReportes()

    const canal = supabase
      .channel("reportes_tiempo_real")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reportes" },
        (payload) => setReportes(prev => [...prev, mapearReporte(payload.new)])
      )
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [])

  // GPS watch cuando hay reporte activo
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

  // Detectar actividad del usuario
  useEffect(() => {
    const actualizar = () => setUltimaActividad(Date.now())
    window.addEventListener("touchstart", actualizar)
    window.addEventListener("click", actualizar)
    return () => {
      window.removeEventListener("touchstart", actualizar)
      window.removeEventListener("click", actualizar)
    }
  }, [])

  function mapearReporte(r: any): Reporte {
    return {
      id: r.id.toString(),
      rutaId: r.ruta_id,
      rutaNombre: r.ruta_nombre,
      rutaColor: r.ruta_color,
      tipo: r.tipo,
      lat: r.lat,
      lng: r.lng,
      timestamp: r.timestamp,
      trazas: [],
    }
  }

  function abrirDesplegable(m: Modo) {
    setModo(m)
    setDesplegableAbierto(true)
  }

  function conteoActivos(rutaId: string) {
    return reportes.filter(r => r.rutaId === rutaId && Date.now() - r.timestamp < TIMEOUT_REPORTE).length
  }

  function mostrarConfirmacion() {
    setConfirmacionVisible(true)
    setTimeout(() => setConfirmacionVisible(false), 2000)
  }

  async function confirmarRuta(ruta: Ruta) {
    setRutaSeleccionada(ruta)
    setDesplegableAbierto(false)
    setEstadoReporte("cargando")

    const publicar = async (pos: GeolocationPosition) => {
      const tipo = modo === "en_bus" ? "en_bus" : "esperando"
      const timestamp = Date.now()

      const { data, error } = await supabase
        .from("reportes")
        .insert({
          ruta_id: ruta.id,
          ruta_nombre: ruta.nombre,
          ruta_color: ruta.color,
          tipo,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp,
        })
        .select()
        .single()

      if (error || !data) { setEstadoReporte("sin_conexion"); return }

      const reporte: Reporte = {
        id: data.id.toString(),
        rutaId: ruta.id,
        rutaNombre: ruta.nombre,
        rutaColor: ruta.color,
        tipo,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        timestamp,
        trazas: [],
      }

      localStorage.setItem(REPORTE_KEY, JSON.stringify(reporte))
      setReporteActivo(reporte)
      setEstadoReporte("activo")
      if (modo === "en_bus") mostrarConfirmacion()
    }

    let intentos = 0
    const intentar = () => {
      navigator.geolocation.getCurrentPosition(
        publicar,
        () => {
          intentos++
          if (intentos < MAX_INTENTOS) setTimeout(intentar, INTERVALO_REINTENTO)
          else setEstadoReporte("sin_conexion")
        }
      )
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

  // Pantalla GPS denegado
  if (gpsPermiso === "denegado") {
    return (
      <main className="h-full bg-zinc-950 text-white flex flex-col items-center justify-center px-6 text-center">
        <Image src="/logo.svg" alt="Mi Ruta" width={80} height={80} className="mb-6 opacity-60" loading="eager" />
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

  // Pantalla onboarding
  if (!onboardingVisto) {
    const pasos = [
      { subtexto: "Reporta dónde vas", texto: "Dinos si estás en el bus o esperando uno. Solo toma dos toques." },
      { subtexto: "Ayuda a los demás", texto: "Tu ubicación aparece en el mapa para que otros sepan dónde va el bus." },
      { subtexto: "Todos ganamos", texto: "Mientras más personas reporten, mejor información tenemos todos. Es gratis." },
    ]
    const paso = pasos[onboardingPaso]
    return (
      <main className="h-full bg-zinc-950 text-white flex flex-col px-8 pt-12 pb-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Image src="/logo.svg" alt="Mi Ruta" width={130} height={130} className="mb-8" loading="eager" />
          <h1 className="text-xl font-semibold mb-2">{paso.subtexto}</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-10">{paso.texto}</p>
          <div className="flex gap-2">
            {pasos.map((_, i) => (
              <div
                key={i}
                style={{ transition: "width 0.3s" }}
                className={`h-2 rounded-full ${i === onboardingPaso ? "bg-white w-6" : "bg-zinc-700 w-2"}`}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {onboardingPaso < pasos.length - 1 ? (
            <button onClick={() => setOnboardingPaso(p => p + 1)} className="w-full py-5 rounded-2xl bg-white text-zinc-950 font-bold text-base">
              Siguiente
            </button>
          ) : (
            <button onClick={terminarOnboarding} className="w-full py-5 rounded-2xl bg-white text-zinc-950 font-bold text-base">
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
          <MapaLeaflet reportes={reportesFiltrados} miPosicion={miPosicion} reporteActivo={reporteActivo} />
        )}

        {/* Ícono flotante */}
        <div style={{ position: "absolute", top: 16, left: 16, zIndex: 999, pointerEvents: "none", filter: "drop-shadow(0px 2px 6px rgba(0,0,0,0.9))" }}>
          <Image src="/icono.svg" alt="Mi Ruta" width={50} height={50} loading="eager" />
        </div>

        {/* Chip estado activo */}
        {estadoReporte === "activo" && reporteActivo && (
          <div style={{
            position: "absolute", top: 16, left: 60, right: 16, zIndex: 1000,
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

        {/* Pop confirmación */}
        {confirmacionVisible && (
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
            background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 16, padding: "14px 16px", textAlign: "center",
          }}>
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>✅ Tu reporte fue publicado</p>
          </div>
        )}

        {/* Error sin conexión */}
        {estadoReporte === "sin_conexion" && (
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
            background: "rgba(9,9,11,0.9)", border: "1px solid #ef4444",
            borderRadius: 16, padding: "14px 16px", textAlign: "center",
          }}>
            <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>Sin conexión. Tu reporte no está activo.</p>
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="flex-shrink-0 px-4 pb-8 pt-4 flex flex-col gap-3">
        {estadoReporte === "activo" && reporteActivo?.tipo === "esperando" ? (
          <div className="flex gap-3">
            <button onClick={cancelarReporte} className="flex-1 py-5 rounded-2xl font-bold text-base" style={{ background: "#27272a", color: "#a1a1aa" }}>
              Cancelar
            </button>
            <button onClick={subirAlBus} className="flex-1 py-5 rounded-2xl font-bold text-base" style={{ background: "#2563eb", color: "#fff" }}>
              ✓ Ya subí
            </button>
          </div>
        ) : estadoReporte === "activo" && reporteActivo?.tipo === "en_bus" ? (
          <button onClick={cancelarReporte} className="w-full py-5 rounded-2xl font-bold text-base" style={{ background: "#27272a", color: "#a1a1aa" }}>
            Cancelar reporte
          </button>
        ) : (
          <>
            <button
              onClick={() => abrirDesplegable("en_bus")}
              disabled={estadoReporte === "cargando"}
              className="w-full py-5 rounded-2xl font-bold text-lg disabled:opacity-40"
              style={{ background: "#2563eb", color: "#fff" }}
            >
              {estadoReporte === "cargando" && modo === "en_bus" ? "Publicando..." : "Estoy en el bus"}
            </button>
            <button
              onClick={() => abrirDesplegable("esperando")}
              disabled={estadoReporte === "cargando"}
              className="w-full py-5 rounded-2xl font-bold text-lg disabled:opacity-40"
              style={{ background: "#16a34a", color: "#fff" }}
            >
              {estadoReporte === "cargando" && modo === "esperando" ? "Publicando..." : "Espero el bus"}
            </button>
          </>
        )}
      </div>

      {/* Desplegable rutas */}
      {desplegableAbierto && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setDesplegableAbierto(false)}
        >
          <div
            style={{ width: "100%", background: "#18181b", borderRadius: "24px 24px 0 0", padding: "24px 16px 40px", maxHeight: "80vh", overflowY: "auto" }}
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
                      width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 14,
                      background: "#09090b", border: "1px solid #3f3f46", color: "#fff", cursor: "pointer",
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