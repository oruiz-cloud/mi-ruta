export default function PantallaFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="marco-app">
      <main className="marco-pantalla">{children}</main>
    </div>
  )
}
