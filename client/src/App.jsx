import { useLivingDesign } from './hooks/useLivingDesign'
import { Header } from './components/Header'
import { SearchCard } from './components/SearchCard'
import { DebugLogger } from './components/DebugLogger'
import { ThemeProvider } from './context/ThemeContext'

function App() {
  const { accentHue, orbit } = useLivingDesign()

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col relative overflow-hidden transition-colors duration-1000">

      {/* LUNAR ATMOSPHERE GLOW (Глобальне місячне світло) */}
      <div
        className="absolute top-1/2 left-1/2 w-[60vw] h-[60vw] rounded-full blur-[180px] pointer-events-none transition-opacity duration-[3000ms]"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          transform: 'translate(-50%, -50%)',
          opacity: `var(--moon-intensity, 0)`, // Сяє тільки в повний місяць
        }}
      />

      {/* ORBITAL GLOW (Земля) */}
      <div
        className="absolute top-1/2 left-1/2 w-[40vw] h-[40vw] rounded-full blur-[150px] opacity-20 pointer-events-none transition-all duration-[2000ms] ease-in-out weather-blur"
        style={{
          backgroundColor: `hsl(${accentHue}, 100%, 50%)`,
          transform: `translate(calc(-50% + ${orbit.x}vw), calc(-50% + ${orbit.y}vh)) scale(${orbit.z})`,
          zIndex: orbit.z > 1 ? 20 : 0 // Заходить за або перед карткою
        }}
      />

      <Header />

      <main className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        <SearchCard />
      </main>

      {/* PERSISTENT DEBUG LOGGER ("EYES") */}
      <DebugLogger />
      </div>
    </ThemeProvider>
  )
}

export default App
