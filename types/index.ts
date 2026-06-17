export type Ruta = {
  id: string
  nombre: string
  color: string
}

export type TipoReporte = "en_bus" | "esperando"

export type Traza = {
  lat: number
  lng: number
  timestamp: number
}

export type Reporte = {
  id: string
  rutaId: string
  rutaNombre: string
  rutaColor: string
  tipo: TipoReporte
  lat: number
  lng: number
  timestamp: number
  trazas: Traza[]   // historial de posiciones — se llena solo si tipo === "en_bus"
}