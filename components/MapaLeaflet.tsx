"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Reporte } from "@/types"

type Props = {
  reportes: Reporte[]
  rutaSeleccionadaId: string | null // NUEVO
  miPosicion: { lat: number; lng: number } | null
  reporteActivo: Reporte | null
}

const MANAGUA = { lat: 12.1328, lng: -86.2904 }

// NUEVO: límites aproximados del área metropolitana de Managua.
// AJUSTAR después de probar en el mapa real — esto es una primera estimación.
const LIMITES_MANAGUA: [[number, number], [number, number]] = [
  [11.98, -86.45], // esquina suroeste
  [12.28, -86.10], // esquina noreste
]

function CentrarMapa({ pos }: { pos: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (pos) map.setView([pos.lat, pos.lng], 15)
  }, [pos, map])
  return null
}

export default function MapaLeaflet({ reportes, rutaSeleccionadaId, miPosicion, reporteActivo }: Props) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    })
  }, [])

  const centro = miPosicion ?? MANAGUA

  // NUEVO: separar reportes en dos grupos — la ruta que elegiste (azul, protagonista)
  // y todo lo demás (gris, contexto de fondo). Se excluye tu propio reporte de ambos grupos.
  const esMiRuta = (r: Reporte) =>
    r.tipo === "en_bus" && rutaSeleccionadaId !== null && r.rutaId === rutaSeleccionadaId

  const reportesAzules = reportes.filter((r) => r.id !== reporteActivo?.id && esMiRuta(r))
  const reportesGrises = reportes.filter((r) => r.id !== reporteActivo?.id && !esMiRuta(r))

  return (
    <>
      <MapContainer
        center={[centro.lat, centro.lng]}
        zoom={15}
        minZoom={11} // NUEVO: evita alejar tanto el zoom que se vea todo el país
        maxBounds={LIMITES_MANAGUA} // NUEVO
        maxBoundsViscosity={1.0} // NUEVO: 1.0 = límite firme, no se puede arrastrar más allá
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />
        <CentrarMapa pos={miPosicion} />

        {/* Marcador de posición propia */}
        {miPosicion && (
          <CircleMarker
            center={[miPosicion.lat, miPosicion.lng]}
            radius={8}
            pathOptions={{
              color: "#fff",
              fillColor: "#0E9F6E",
              fillOpacity: 1,
              weight: 2,
            }}
          />
        )}

        {/* NUEVO: actividad de fondo — otras rutas, en gris, tenue */}
        {reportesGrises.map((r) => {
          const minutosAtras = Math.round((Date.now() - r.timestamp) / 60000)
          const enBus = r.tipo === "en_bus"
          return (
            <CircleMarker
              key={r.id}
              center={[r.lat, r.lng]}
              radius={enBus ? 8 : 5}
              pathOptions={{
                color: "#8B929C",
                fillColor: "#8B929C",
                fillOpacity: enBus ? 0.5 : 0.35,
                weight: 1.5,
                className: "marcador-pulso-gris",
              }}
            >
              <Popup>
                <strong>Ruta {r.rutaNombre}</strong><br />
                {enBus ? "En el bus" : "Esperando"}<br />
                Hace {minutosAtras} min
              </Popup>
            </CircleMarker>
          )
        })}

        {/* Tu ruta elegida — en azul, protagonista */}
        {reportesAzules.map((r) => {
          const minutosAtras = Math.round((Date.now() - r.timestamp) / 60000)
          return (
            <CircleMarker
              key={r.id}
              center={[r.lat, r.lng]}
              radius={10}
              pathOptions={{
                color: r.rutaColor,
                fillColor: r.rutaColor,
                fillOpacity: 0.85,
                weight: 1,
                className: "marcador-pulso-azul",
              }}
            >
              <Popup>
                <strong>{r.rutaNombre}</strong><br />
                En el bus<br />
                Hace {minutosAtras} min
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* NUEVO: animación sutil de pulso para comunicar "esto se está moviendo/actualizando" */}
      <style>{`
        .marcador-pulso-gris {
          animation: pulsoGris 2.2s ease-in-out infinite;
        }
        .marcador-pulso-azul {
          animation: pulsoAzul 1.6s ease-in-out infinite;
        }
        @keyframes pulsoGris {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes pulsoAzul {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>
  )
}