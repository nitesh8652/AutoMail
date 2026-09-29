import './MiLoader.css'

// Bouncing-ball loader for data fetches, refreshes and saves. `size` is in px (default ≈ 140px wide).
const MiLoader = ({ size = 25 }) => (
  <div className="mi-loader" style={{ fontSize: size }} role="status" aria-label="Loading" />
)

export const MiLoaderOverlay = ({ message }) => (
  <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center gap-4 bg-white/85 backdrop-blur-sm">
    <MiLoader />
    {message && <p className="text-sm font-bold text-slate-600">{message}</p>}
  </div>
)

export default MiLoader
