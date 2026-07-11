import { createContext, useContext, useEffect, useState } from "react"
import {
  applyAccentColor,
  removeAccentColor,
  applyUiPalette,
  removeUiPalette,
  getIsDark,
  DEFAULT_ACCENT_HEX,
  ACCENT_STORAGE_KEY,
} from "@/lib/accent-color"
import {
  type ThemeMode,
  type FontSize,
  type BorderRadius,
  type Density,
  applyThemeExtras,
  loadSavedExtras,
  saveExtras,
} from "@/lib/theme-config"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: ThemeMode
  storageKey?: string
}

type ThemeProviderState = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  accentColor: string
  setAccentColor: (hex: string) => void
  resetAccentColor: () => void
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
  radius: BorderRadius
  setRadius: (r: BorderRadius) => void
  density: Density
  setDensity: (d: Density) => void
  uiHue: number | null
  setUiHue: (hue: number | null) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  accentColor: DEFAULT_ACCENT_HEX,
  setAccentColor: () => null,
  resetAccentColor: () => null,
  fontSize: "md",
  setFontSize: () => null,
  radius: "soft",
  setRadius: () => null,
  density: "comfortable",
  setDensity: () => null,
  uiHue: null,
  setUiHue: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemeMode>(
    () => (localStorage.getItem(storageKey) as ThemeMode) || defaultTheme
  )
  const [accentColor, setAccentColorState] = useState<string>(
    () => localStorage.getItem(ACCENT_STORAGE_KEY) || DEFAULT_ACCENT_HEX
  )

  const savedExtras = loadSavedExtras()
  const [fontSize, setFontSizeState] = useState<FontSize>(savedExtras.fontSize)
  const [radius, setRadiusState] = useState<BorderRadius>(savedExtras.radius)
  const [density, setDensityState] = useState<Density>(savedExtras.density)
  const [uiHue, setUiHueState] = useState<number | null>(savedExtras.uiHue)

  // Apply dark/light class + re-apply palette after class changes
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }

    // Re-apply after class settles
    requestAnimationFrame(() => {
      const isDark = getIsDark()
      const saved = localStorage.getItem(ACCENT_STORAGE_KEY)
      if (saved && saved !== DEFAULT_ACCENT_HEX) applyAccentColor(saved)
      // Re-read uiHue from state via closure — it's stable here
      const extrasRaw = localStorage.getItem("pixlr-theme-extras")
      if (extrasRaw) {
        try {
          const p = JSON.parse(extrasRaw)
          if (p.uiHue !== null && typeof p.uiHue === "number") {
            applyUiPalette(p.uiHue, isDark)
          }
        } catch {}
      }
    })
  }, [theme])

  // Apply everything on mount
  useEffect(() => {
    const isDark = getIsDark()
    const saved = localStorage.getItem(ACCENT_STORAGE_KEY)
    if (saved && saved !== DEFAULT_ACCENT_HEX) applyAccentColor(saved)
    applyThemeExtras({ fontSize, radius, density })
    if (uiHue !== null) applyUiPalette(uiHue, isDark)
  }, [])

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme) => {
      localStorage.setItem(storageKey, newTheme)
      setTheme(newTheme)
    },
    accentColor,
    setAccentColor: (hex) => {
      localStorage.setItem(ACCENT_STORAGE_KEY, hex)
      setAccentColorState(hex)
      applyAccentColor(hex)
    },
    resetAccentColor: () => {
      localStorage.removeItem(ACCENT_STORAGE_KEY)
      setAccentColorState(DEFAULT_ACCENT_HEX)
      removeAccentColor()
    },
    fontSize,
    setFontSize: (size) => {
      setFontSizeState(size)
      const extras = { fontSize: size, radius, density, uiHue }
      saveExtras(extras)
      applyThemeExtras(extras)
    },
    radius,
    setRadius: (r) => {
      setRadiusState(r)
      const extras = { fontSize, radius: r, density, uiHue }
      saveExtras(extras)
      applyThemeExtras(extras)
    },
    density,
    setDensity: (d) => {
      setDensityState(d)
      const extras = { fontSize, radius, density: d, uiHue }
      saveExtras(extras)
      applyThemeExtras(extras)
    },
    uiHue,
    setUiHue: (hue) => {
      setUiHueState(hue)
      const extras = { fontSize, radius, density, uiHue: hue }
      saveExtras(extras)
      if (hue === null) {
        removeUiPalette()
      } else {
        applyUiPalette(hue, getIsDark())
      }
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
