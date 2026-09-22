"use client"

import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import { RUTAS } from "@/lib/rutas"
import { supabase } from "@/lib/supabase"
import { Reporte, Ruta, TipoReporte } from "@/types"
import { IconoBus, IconoPin, IconoPinBloqueado, IconoRed, IconoCheck, IconoReloj, IconoAlerta, Insignia } from "@/components/Iconos"
import PantallaFrame from "@/components/PantallaFrame"
import Boton from "@/components/Boton"
import BannerFlotante from "@/components/BannerFlotante"

const INK = "#14171A"
const INK_SUAVE = "#5C6470"
const ACENTO = "#0E9F6E"
const PELIGRO = "#DC2626"

const MapaLeaflet = dynamic(() => import("@/components/MapaLeaflet"), { ssr: false })

type Modo = "idle" | "en_bus" | "esperando"
type EstadoReporte = "idle" | "cargando" | "activo" | "sin_conexion"
type ModoPicker = "nuevo" | "cambiar" // NUEVO

type FilaReporte = {
  id: number | string
  ruta_id: string
  ruta_nombre: string
  ruta_color: string
  tipo: TipoReporte
  lat: number
  lng: number
  timestamp: number
}

const ONBOARDING_KEY = "mi_ruta_onboarding_visto"
const REPORTE_KEY = "mi_ruta_reporte_activo"
const TIMEOUT_REPORTE = 20 * 60 * 1000
const TIMEOUT_GPS = 30 * 60 * 1000
const MAX_INTENTOS = 3
const INTERVALO_REINTENTO = 30000
const ITEM_HEIGHT = 80
const AVISO_VENCIMIENTO = 2 * 60 * 1000 // NUEVO: avisar cuando falten 2 min o menos

export default function Home() {
  const [onboardingVisto, setOnboardingVisto] = useState(true)
  const [onboardingPaso, setOnboardingPaso] = useState(0)
  const [modo, setModo] = useState<Modo>("idle")
  const [modoPicker, setModoPicker] = useState<ModoPicker>("nuevo") // NUEVO
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [rutaSeleccionada, setRutaSeleccionada] = useState<Ruta | null>(null)
  const [indiceRuta, setIndiceRuta] = useState(0)
  const [busquedaRuta, setBusquedaRuta] = useState("") // NUEVO
  const [estadoReporte, setEstadoReporte] = useState<EstadoReporte>("idle")
  const [reporteActivo, setReporteActivo] = useState<Reporte | null>(null)
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [miPosicion, setMiPosicion] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsPermiso, setGpsPermiso] = useState<"pendiente" | "ok" | "denegado">("pendiente")
  const [confirmacionVisible, setConfirmacionVisible] = useState(false)
  const [ultimaActividad, setUltimaActividad] = useState(Date.now())
  const [gpsError, setGpsError] = useState(false)
  const [ahora, setAhora] = useState(Date.now()) // NUEVO: para calcular tiempo restante del reporte
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startIndex = useRef(0)
  const ultimoIndiceVibrado = useRef(0)
  const dialogPickerRef = useRef<HTMLDialogElement>(null)

  // Verificar si GPS está disponible
  useEffect(() => {
    if (!navigator.geolocation) setGpsPermiso("denegado")
  }, [])

  // Onboarding
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
      const { data, error } = await supabase.from("reportes").select("*").gt("timestamp", Date.now() - TIMEOUT_REPORTE)
      if (!error && data) setReportes(data.map(mapearReporte))
    }
    cargarReportes()
    const canal = supabase.channel("reportes_tiempo_real")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reportes" },
        (payload) => setReportes(prev => [...prev, mapearReporte(payload.new as FilaReporte)])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reportes" },
        (payload) => {
          const actualizado = mapearReporte(payload.new as FilaReporte)
          setReportes(prev => prev.map(r => r.id === actualizado.id ? actualizado : r))
        }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reportes" },
        (payload) => {
          const idEliminado = payload.old.id?.toString()
          setReportes(prev => prev.filter(r => r.id !== idEliminado))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  // GPS watch cuando hay reporte activo
  useEffect(() => {
    if (estadoReporte !== "activo") return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(false)
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
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [estadoReporte, ultimaActividad])

  // Detectar actividad
  useEffect(() => {
    const actualizar = () => setUltimaActividad(Date.now())
    window.addEventListener("touchstart", actualizar)
    window.addEventListener("click", actualizar)
    return () => { window.removeEventListener("touchstart", actualizar); window.removeEventListener("click", actualizar) }
  }, [])

  // Bloquear el scroll del body mientras el picker está abierto
  useEffect(() => {
    if (pickerAbierto) {
      const overflowOriginal = document.body.style.overflow
      const overscrollOriginal = document.body.style.overscrollBehavior
      document.body.style.overflow = "hidden"
      document.body.style.overscrollBehavior = "none"
      return () => {
        document.body.style.overflow = overflowOriginal
        document.body.style.overscrollBehavior = overscrollOriginal
      }
    }
  }, [pickerAbierto])

  // Abrir/cerrar el <dialog> nativo del picker en sincro con el estado
  // (showModal() da foco inicial, trampa de foco y cierre con Escape gratis)
  useEffect(() => {
    const dialogo = dialogPickerRef.current
    if (!dialogo) return
    if (pickerAbierto && !dialogo.open) dialogo.showModal()
    else if (!pickerAbierto && dialogo.open) dialogo.close()
  }, [pickerAbierto])

  // NUEVO: reloj interno que se actualiza cada 15s mientras hay un reporte activo,
  // para poder calcular cuánto le queda antes de vencer sin refrescar la página
  useEffect(() => {
    if (estadoReporte !== "activo") return
    const intervalo = setInterval(() => setAhora(Date.now()), 15000)
    return () => clearInterval(intervalo)
  }, [estadoReporte])

  // NUEVO: tiempo restante del reporte activo, y si está por vencer
  const tiempoRestante = reporteActivo ? TIMEOUT_REPORTE - (ahora - reporteActivo.timestamp) : null
  const reporteApuntoDeVencer = tiempoRestante !== null && tiempoRestante > 0 && tiempoRestante <= AVISO_VENCIMIENTO

  // NUEVO: si el tiempo ya se agotó del todo mientras la app seguía abierta, cancelar solo
  useEffect(() => {
    if (estadoReporte === "activo" && tiempoRestante !== null && tiempoRestante <= 0) {
      cancelarReporte()
    }
  }, [tiempoRestante, estadoReporte])

  function mapearReporte(r: FilaReporte): Reporte {
    return { id: r.id.toString(), rutaId: r.ruta_id, rutaNombre: r.ruta_nombre, rutaColor: r.ruta_color, tipo: r.tipo, lat: r.lat, lng: r.lng, timestamp: r.timestamp, trazas: [] }
  }

  function mostrarConfirmacion() {
    setConfirmacionVisible(true)
    setTimeout(() => setConfirmacionVisible(false), 2000)
  }

  function conteoActivos(rutaId: string) {
    return reportes.filter(r => r.rutaId === rutaId && Date.now() - r.timestamp < TIMEOUT_REPORTE).length
  }

  // NUEVO: acepta un segundo parámetro para distinguir "reporte nuevo" de "cambiar ruta del reporte activo"
  function abrirPicker(m: Modo, modoP: ModoPicker = "nuevo") {
    setModo(m)
    setModoPicker(modoP)
    setBusquedaRuta("")
    setPickerAbierto(true)
  }

  function pedirGPS() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMiPosicion({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsPermiso("ok")
      },
      () => setGpsPermiso("denegado")
    )
  }

  function onTouchStart(e: React.TouchEvent) {
    isDragging.current = true
    startY.current = e.touches[0].clientY
    startIndex.current = indiceRuta
    ultimoIndiceVibrado.current = indiceRuta
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return
    const delta = startY.current - e.touches[0].clientY
    const newIndex = Math.round(startIndex.current + delta / ITEM_HEIGHT)
    const indiceClamp = Math.max(0, Math.min(RUTAS.length - 1, newIndex))
    setIndiceRuta(indiceClamp)

    if (indiceClamp !== ultimoIndiceVibrado.current) {
      ultimoIndiceVibrado.current = indiceClamp
      if (typeof navigator.vibrate === "function") {
        navigator.vibrate(8)
      }
    }
  }

  function onTouchEnd() {
    isDragging.current = false
  }

  // NUEVO: buscar ruta por número escrito y saltar el selector a esa posición
  function onCambiarBusqueda(valor: string) {
    const soloNumeros = valor.replace(/[^0-9]/g, "")
    setBusquedaRuta(soloNumeros)
    const encontrada = RUTAS.findIndex(r => r.id === soloNumeros)
    if (encontrada !== -1) {
      setIndiceRuta(encontrada)
      if (typeof navigator.vibrate === "function") navigator.vibrate(8)
    }
  }

  async function confirmarRuta() {
    const ruta = RUTAS[indiceRuta]
    setPickerAbierto(false)

    // NUEVO: si estamos cambiando la ruta de un reporte ya activo, solo actualizamos ese registro
    if (modoPicker === "cambiar" && reporteActivo) {
      setRutaSeleccionada(ruta)
      const timestamp = Date.now()
      const { error } = await supabase.from("reportes").update({
        ruta_id: ruta.id, ruta_nombre: ruta.nombre, ruta_color: ruta.color, timestamp,
      }).eq("id", reporteActivo.id)

      if (error) { setEstadoReporte("sin_conexion"); return }

      const actualizado: Reporte = { ...reporteActivo, rutaId: ruta.id, rutaNombre: ruta.nombre, rutaColor: ruta.color, timestamp }
      localStorage.setItem(REPORTE_KEY, JSON.stringify(actualizado))
      setReporteActivo(actualizado)
      setAhora(Date.now())
      mostrarConfirmacion()
      return
    }

    setRutaSeleccionada(ruta)
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
      setAhora(Date.now())
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
    const { error } = await supabase.from("reportes").update({ tipo: "en_bus", timestamp: actualizado.timestamp }).eq("id", reporteActivo.id)
    if (error) { setEstadoReporte("sin_conexion"); return }
    localStorage.setItem(REPORTE_KEY, JSON.stringify(actualizado))
    setReporteActivo(actualizado)
    setModo("en_bus")
    setAhora(Date.now())
    mostrarConfirmacion()
  }

  // NUEVO: extender el reporte activo sin cambiar de ruta (botón del aviso de vencimiento)
  async function refrescarReporte() {
    if (!reporteActivo) return
    const timestamp = Date.now()
    const { error } = await supabase.from("reportes").update({ timestamp }).eq("id", reporteActivo.id)
    if (error) { setEstadoReporte("sin_conexion"); return }
    const actualizado = { ...reporteActivo, timestamp }
    localStorage.setItem(REPORTE_KEY, JSON.stringify(actualizado))
    setReporteActivo(actualizado)
    setAhora(Date.now())
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

  // NUEVO ORDEN: primero el onboarding, después los permisos de GPS.
  // Así el usuario entiende para qué sirve la app antes de que le pidamos su ubicación.

  // Onboarding
  if (!onboardingVisto) {
    const pasos = [
      { Icono: IconoBus, titulo: "Reportá dónde vas", texto: "Decinos si estás en el bus o esperando uno. Solo toma dos toques." },
      { Icono: IconoPin, titulo: "Ayudá a los demás", texto: "Tu ubicación aparece en el mapa para que otros sepan dónde va el bus." },
      { Icono: IconoRed, titulo: "Todos ganamos", texto: "Mientras más personas reporten, mejor información tenemos todos. Es gratis." },
    ]
    const paso = pasos[onboardingPaso]
    return (
      <PantallaFrame>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 32px 40px" }}>
          <Image src="/logo-ink.svg" alt="Mi Ruta" width={72} height={90} style={{ opacity: 0.85 }} loading="eager" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <Insignia tamano={116} colorFondo="rgba(14,159,110,0.12)" colorAcento={ACENTO}>
              <paso.Icono size={52} color={ACENTO} strokeWidth={1.75} />
            </Insignia>
            <h1 style={{ fontSize: 27, fontWeight: 700, color: INK, marginBottom: 12, letterSpacing: -0.5 }}>{paso.titulo}</h1>
            <p style={{ fontSize: 16, color: INK_SUAVE, lineHeight: 1.6, marginBottom: 32, maxWidth: 280 }}>{paso.texto}</p>
            <div style={{ display: "flex", gap: 8 }}>
              {pasos.map((_, i) => (
                <div key={i} style={{
                  height: 8, borderRadius: 4,
                  background: i === onboardingPaso ? ACENTO : "#E4E4E0",
                  width: i === onboardingPaso ? 28 : 8,
                  transition: "all 0.3s"
                }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {onboardingPaso < pasos.length - 1 ? (
              <Boton tamano="mediano" onClick={() => setOnboardingPaso(p => p + 1)}>Siguiente</Boton>
            ) : (
              <Boton tamano="mediano" onClick={terminarOnboarding}>Empezar</Boton>
            )}
            <button onClick={terminarOnboarding} style={{ background: "none", border: "none", color: "#8B929C", fontSize: 15, cursor: "pointer", padding: "10px" }}>
              Saltar
            </button>
          </div>
        </div>
      </PantallaFrame>
    )
  }

  // Pantalla: GPS no disponible o pendiente
  if (gpsPermiso === "pendiente") {
    return (
      <PantallaFrame>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
          <Insignia tamano={100} colorFondo="rgba(14,159,110,0.1)" colorAcento={ACENTO}>
            <IconoPin size={44} color={ACENTO} strokeWidth={1.75} />
          </Insignia>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#14171A", marginBottom: 12, letterSpacing: -0.5 }}>
            Activá tu ubicación
          </h1>
          <p style={{ fontSize: 16, color: "#5C6470", lineHeight: 1.6, marginBottom: 40, maxWidth: 280 }}>
            Mi Ruta necesita saber dónde estás para mostrarte los buses cercanos en tiempo real.
          </p>
          <Boton onClick={pedirGPS}>Activar ubicación</Boton>
        </div>
      </PantallaFrame>
    )
  }

  // Pantalla: GPS denegado
  if (gpsPermiso === "denegado") {
    return (
      <PantallaFrame>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
          <Insignia tamano={100} colorFondo="rgba(220,38,38,0.1)" colorAcento={PELIGRO}>
            <IconoPinBloqueado size={44} color={PELIGRO} strokeWidth={1.75} />
          </Insignia>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#14171A", marginBottom: 12, letterSpacing: -0.5 }}>
            Ubicación bloqueada
          </h1>
          <p style={{ fontSize: 16, color: "#5C6470", lineHeight: 1.6, marginBottom: 40, maxWidth: 280 }}>
            Activá el permiso de ubicación en la configuración de tu navegador y recargá la página.
          </p>
          <Boton onClick={() => window.location.reload()}>Ya lo activé — recargar</Boton>
        </div>
      </PantallaFrame>
    )
  }

  const reportesFiltrados = modo === "esperando" && rutaSeleccionada
    ? reportes.filter(r => r.rutaId === rutaSeleccionada.id && r.tipo === "en_bus")
    : []

  return (
    <PantallaFrame>
      {/* Mapa */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, borderRadius: "0 0 28px 28px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
        {gpsPermiso === "ok" && (
          <MapaLeaflet reportes={reportesFiltrados} rutaSeleccionadaId={rutaSeleccionada?.id ?? null} miPosicion={miPosicion} reporteActivo={reporteActivo} />
        )}

        <div style={{ position: "absolute", top: 16, left: 16, zIndex: 999, pointerEvents: "none", filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.2))" }}>
          <Image src="/icono.svg" alt="Mi Ruta" width={44} height={44} loading="eager" />
        </div>

        {estadoReporte === "activo" && reporteActivo && (
          <div style={{
            position: "absolute", top: 16, left: 68, right: 16, zIndex: 1000,
            background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)",
            borderRadius: 14, padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            boxShadow: "0 2px 16px rgba(0,0,0,0.1)"
          }}>
            <span style={{ fontSize: 15, color: "#14171A", fontWeight: 600, display: "flex", alignItems: "center" }}>
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                backgroundColor: "#0E9F6E",
                animation: "pulso 1.5s ease-in-out infinite",
                marginRight: 10, flexShrink: 0,
              }} />
              {reporteActivo.tipo === "en_bus" ? "Viajando en la ruta" : "Esperando la ruta"}&nbsp;{reporteActivo.rutaNombre}
            </span>
            {reporteActivo.tipo === "esperando" && reportesFiltrados.length === 0 && (
              <span style={{ color: INK_SUAVE, fontSize: 12, fontWeight: 600, background: "#F0F0EE", padding: "4px 10px", borderRadius: 20, flexShrink: 0 }}>
                Sin actividad
              </span>
            )}
          </div>
        )}

        {confirmacionVisible && (
          <BannerFlotante variante="exito" animar icono={<IconoCheck size={22} color={ACENTO} strokeWidth={2.25} />}>
            Reporte publicado
          </BannerFlotante>
        )}

        {estadoReporte === "sin_conexion" && (
          <BannerFlotante variante="error" icono={<IconoAlerta size={20} color={PELIGRO} strokeWidth={2.25} />}>
            Sin conexión. Tu reporte no está activo.
          </BannerFlotante>
        )}

        {estadoReporte === "activo" && gpsError && !confirmacionVisible && (
          <BannerFlotante variante="error" icono={<IconoAlerta size={20} color={PELIGRO} strokeWidth={2.25} />}>
            No pudimos actualizar tu ubicación. Revisá el GPS.
          </BannerFlotante>
        )}

        {/* Aviso cuando el reporte está por vencer, con opción de extenderlo */}
        {estadoReporte === "activo" && reporteApuntoDeVencer && !confirmacionVisible && (
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24, zIndex: 1000,
            background: "rgba(217,119,6,0.08)", border: "1.5px solid rgba(217,119,6,0.3)", borderRadius: 16,
            padding: "16px", textAlign: "center"
          }}>
            <p style={{
              color: "#7C4A03", fontSize: 15, fontWeight: 600, margin: "0 0 10px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <IconoReloj size={18} color="#D97706" strokeWidth={2.25} />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                Tu reporte vence en {Math.max(1, Math.ceil((tiempoRestante ?? 0) / 60000))} min
              </span>
            </p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Boton variante="advertencia" tamano="chico" full={false} onClick={refrescarReporte}>
                Sigo esperando — actualizar
              </Boton>
            </div>
          </div>
        )}
      </div>

      {/* Botones */}
      <div style={{ flexShrink: 0, padding: "20px 20px 36px", display: "flex", flexDirection: "column", gap: 12 }}>
        {estadoReporte === "activo" && reporteActivo?.tipo === "esperando" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <Boton variante="secundaria" tamano="mediano" flex={1} onClick={cancelarReporte}>
                Cancelar
              </Boton>
              <Boton variante="primaria" tamano="mediano" flex={1} onClick={subirAlBus}>
                <IconoCheck size={18} color="#fff" strokeWidth={2.5} />
                Ya subí
              </Boton>
            </div>
            <button
              onClick={() => abrirPicker("esperando", "cambiar")}
              style={{ background: "none", border: "none", color: "#0E9F6E", fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "8px" }}
            >
              Cambiar ruta
            </button>
          </div>
        ) : estadoReporte === "activo" && reporteActivo?.tipo === "en_bus" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Boton variante="secundaria" tamano="mediano" onClick={cancelarReporte}>
              Cancelar reporte
            </Boton>
            <button
              onClick={() => abrirPicker("en_bus", "cambiar")}
              style={{ background: "none", border: "none", color: "#0E9F6E", fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "8px" }}
            >
              Cambiar ruta
            </button>
          </div>
        ) : (
          <>
            <Boton onClick={() => abrirPicker("en_bus")} disabled={estadoReporte === "cargando"}>
              {estadoReporte === "cargando" && modo === "en_bus" ? "Publicando..." : "Estoy en el bus"}
            </Boton>
            <Boton variante="contorno" onClick={() => abrirPicker("esperando")} disabled={estadoReporte === "cargando"}>
              {estadoReporte === "cargando" && modo === "esperando" ? "Publicando..." : "Espero el bus"}
            </Boton>
          </>
        )}
      </div>

      {/* Picker ruleta — <dialog> nativo: foco inicial, trampa de foco y cierre con Escape */}
      <dialog
        ref={dialogPickerRef}
        className="hoja-picker"
        aria-labelledby="picker-titulo"
        onCancel={() => setPickerAbierto(false)}
        onClose={() => setPickerAbierto(false)}
        onClick={(e) => { if (e.target === dialogPickerRef.current) setPickerAbierto(false) }}
        style={{ touchAction: "none" }}
      >
        <div style={{ width: "100%", background: "#fff", borderRadius: "28px 28px 0 0", paddingBottom: 40, touchAction: "none" }}>
          <div style={{ width: 44, height: 5, background: "#E4E4E0", borderRadius: 3, margin: "16px auto 20px" }} />

          <p id="picker-titulo" style={{ textAlign: "center", fontSize: 22, color: "#14171A", margin: "0 0 6px", fontWeight: 700, letterSpacing: -0.5 }}>
            {modoPicker === "cambiar" ? "¿A qué ruta cambiás?" : modo === "en_bus" ? "¿En qué bus vas?" : "¿Qué bus esperás?"}
          </p>
          <p style={{ textAlign: "center", fontSize: 15, color: "#8B929C", margin: "0 0 16px", fontWeight: 400 }}>
            Deslizá para seleccionar o escribí el número
          </p>

          {/* Buscador numérico */}
          <div style={{ padding: "0 20px 12px" }}>
            <label htmlFor="busqueda-ruta" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
              Buscar ruta por número
            </label>
            <input
              id="busqueda-ruta"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={busquedaRuta}
              onChange={(e) => onCambiarBusqueda(e.target.value)}
              placeholder="Escribí el número de ruta"
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 14,
                border: "1.5px solid #E4E4E0", fontSize: 16, textAlign: "center",
                color: "#14171A", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

            <div style={{ position: "relative", height: ITEM_HEIGHT * 5, overflow: "hidden", userSelect: "none", touchAction: "none" }}>
              <div style={{
                position: "absolute", top: "50%", left: 20, right: 20,
                transform: "translateY(-50%)", height: ITEM_HEIGHT,
                borderTop: "2.5px solid #0E9F6E", borderBottom: "2.5px solid #0E9F6E",
                borderRadius: 14, background: "rgba(14,159,110,0.06)",
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
                  touchAction: "none",
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
                        color: distancia === 0 ? "#0E9F6E" : "#8B929C",
                        letterSpacing: -1,
                        fontVariantNumeric: "tabular-nums",
                        transition: "all 0.25s",
                      }}>
                        {ruta.id}
                      </span>
                      {activos > 0 && distancia === 0 && (
                        <span style={{
                          fontSize: 13, color: "#0E9F6E", fontWeight: 600,
                          background: "rgba(14,159,110,0.1)", padding: "4px 10px", borderRadius: 20
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
              <Boton onClick={confirmarRuta}>Confirmar</Boton>
            </div>
          </div>
      </dialog>

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
    </PantallaFrame>
  )
}