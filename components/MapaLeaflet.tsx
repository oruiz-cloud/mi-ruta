"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Reporte } from "@/types"

type Props = {
  reportes: Reporte[]
  miPosicion: { lat: number; lng: number } | null
  reporteActivo: Reporte | null
}

const MANAGUA = { lat: 12.1328, lng: -86.2904 }

function CentrarMapa({ pos }: { pos: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (pos) map.setView([pos.lat, pos.lng], 15)
  }, [pos, map])
  return null
}

export default function MapaLeaflet({ reportes, miPosicion, reporteActivo }: Props) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    })
  }, [])

  const centro = miPosicion ?? MANAGUA

  return (
    <MapContainer
      center={[centro.lat, centro.lng]}
      zoom={15}
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
            fillColor: "#3b82f6",
            fillOpacity: 1,
            weight: 2,
          }}
        />
      )}

      {/* Reportes de otros usuarios */}
      {reportes.map((r) => {
        const minutosAtras = Math.round((Date.now() - r.timestamp) / 60000)
        const enBus = r.tipo === "en_bus"
        return (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lng]}
            radius={10}
            pathOptions={{
              color: r.rutaColor,
              fillColor: r.rutaColor,
              fillOpacity: enBus ? 0.85 : 0,
              weight: enBus ? 1 : 2.5,
            }}
          >
            <Popup>
              <strong>{r.rutaNombre}</strong><br />
              {enBus ? "En el bus" : "Esperando"}<br />
              Hace {minutosAtras} min
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}