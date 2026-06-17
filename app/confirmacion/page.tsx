"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Reporte } from "@/types"

export default function ConfirmacionPage() {
  const router = useRouter()
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [minutosEsperando, setMinutosEsperando] = useState(0)

  useEffect(() => {
    const raw = localStorage.getItem("miReporte")
    if (!raw) { router.push("/"); return }

    const r: Reporte = JSON.parse(raw)

    // Solo mostrar si el reporte es de tipo "esperando"
    if (r.tipo !== "esperando") { router.push("/mapa"); return }

    setReporte(r)
    setMinutosEsperando(Math.round((Date.now() - r.timestamp) / 60000))

    // Actualizar el contador cada minuto
    const intervalo = setInterval(() => {
      setMinutosEsperando(Math.round((Date.now() - r.timestamp) / 60000))
    }, 60000)

    return () => clearInterval(intervalo)
  }, [router])

  function handleMontarse() {
    if (!reporte) return

    // Actualizar el reporte existente de "esperando" a "en_bus"
    const todos: Reporte[] = JSON.parse(localStorage.getItem("reportes") ?? "[]")
    const actualizados = todos.map(r =>
      r.id === reporte.id ? { ...r, tipo: "en_bus" as const, timestamp: Date.now() } : r
    )
    localStorage.setItem("reportes", JSON.stringify(actualizados))
    localStorage.setItem("miReporte", JSON.stringify({ ...reporte, tipo: "en_bus" }))

    router.push("/mapa")
  }

  function handleSeguirEsperando() {
    router.push("/mapa")
  }

  if (!reporte) return null

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col px-5 pt-12 pb-8">

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Mi Ruta</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Esperando la {reporte.rutaNombre.split("—")[0].trim()}
        </p>
      </div>

      {/* Card de confirmación */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 text-center">

        {/* Anillo con tiempo */}
        <div
          className="w-20 h-20 rounded-full border-2 flex items-center justify-content-center mx-auto mb-5 flex items-center justify-center"
          style={{ borderColor: reporte.rutaColor }}
        >
          <span className="text-xl font-bold" style={{ color: reporte.rutaColor }}>
            {minutosEsperando}m
          </span>
        </div>

        <h2 className="text-lg font-semibold mb-2">¿Ya te montaste?</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Un bus de la {reporte.rutaNombre.split("—")[0].trim()} pasó por tu zona
        </p>

        <button
          onClick={handleMontarse}
          className="w-full py-4 rounded-xl bg-white text-zinc-950 font-semibold text-base active:scale-95 transition-all mb-3"
        >
          Sí, ya voy en el bus
        </button>
        <button
          onClick={handleSeguirEsperando}
          className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm active:scale-95 transition-all"
        >
          No, sigo esperando
        </button>
      </div>

      {/* Reporte activo */}
      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <p className="text-xs text-zinc-500 mb-2">Reporte activo</p>
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "transparent",
              border: `2px solid ${reporte.rutaColor}`,
            }}
          />
          <span className="text-sm text-zinc-300">
            Esperando · {reporte.rutaNombre.split("—")[0].trim()}
          </span>
          <span className="text-xs text-zinc-600 ml-auto">
            hace {minutosEsperando} min
          </span>
        </div>
      </div>

    </main>
  )
}