import Myroutes from './routes/Myroutes'

function App() {
  return (
    <main className="relative flex min-h-screen min-w-80 flex-col overflow-hidden bg-[#f8fbfe] text-[#102a43]">
      <div className="pointer-events-none absolute -left-48 top-1/2 h-96 w-96 rounded-full bg-[#1070BA]/8 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -top-28 h-96 w-96 rounded-full bg-[#1070BA]/7 blur-3xl" />
      <Myroutes />
    </main>
  )
}

export default App
