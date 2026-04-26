import { MagneticButton } from './MagneticButton'
import { useTheme } from '../context/ThemeContext'
import { Sun, Moon } from 'lucide-react'

export function Header() {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="w-full py-6 px-8 flex justify-between items-center border-b border-foreground/5 bg-background/20 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-ubuntu-orange rounded-full flex items-center justify-center shadow-lg shadow-orange-600/20">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tighter text-foreground">
            SEMANTIC<span className="text-ubuntu-orange">SEARCH</span>
          </h1>
          <p className="text-[10px] font-mono text-foreground/40 uppercase tracking-widest">Neural Engine v1.0</p>
        </div>
      </div>

      <nav className="hidden md:flex gap-8 items-center">
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-foreground/5 transition-colors text-foreground"
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <a href="#" className="text-xs font-mono text-foreground/60 hover:text-foreground transition-colors">DOCUMENTATION</a>
        <a href="#" className="text-xs font-mono text-foreground/60 hover:text-foreground transition-colors">API_KEYS</a>
        <MagneticButton className="px-6 py-2 bg-foreground/5 border border-foreground/10 text-foreground text-xs font-bold rounded-sm hover:bg-foreground/10 transition-all">
          SIGN_IN
        </MagneticButton>
      </nav>
    </header>
  )
}
