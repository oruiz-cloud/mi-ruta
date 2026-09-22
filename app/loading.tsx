export default function Loading() {
  return (
    <main style={{ height: "100dvh", background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: "3px solid #E4E4E0", borderTopColor: "#0E9F6E",
        animation: "girar 0.8s linear infinite",
      }} />
      <style>{`@keyframes girar { to { transform: rotate(360deg) } }`}</style>
    </main>
  )
}
