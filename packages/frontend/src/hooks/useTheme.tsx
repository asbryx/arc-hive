import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark'
    return (localStorage.getItem('archivehub-theme') as Theme) || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('archivehub-theme', theme)
  }, [theme])

  const toggle = useCallback(() => {
    // Create scanline element
    const scanline = document.createElement('div')
    scanline.className = 'theme-scanline'
    document.body.appendChild(scanline)

    // Flip theme halfway through animation
    setTimeout(() => {
      setTheme(t => t === 'dark' ? 'light' : 'dark')
    }, 200)

    // Remove scanline after animation
    setTimeout(() => {
      scanline.remove()
    }, 500)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
