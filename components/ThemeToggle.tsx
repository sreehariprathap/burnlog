"use client"

import { useEffect, useState } from "react"
import { useTheme } from "./ThemeProvider"
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [isDark, setIsDark] = useState(false)

  // Resolve the applied theme (handles "system") by reading the <html> class,
  // which ThemeProvider keeps in sync.
  useEffect(() => {
    const read = () =>
      setIsDark(document.documentElement.classList.contains("dark"))
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [theme])

  return (
    <AnimatedThemeToggler
      theme={isDark ? "dark" : "light"}
      onThemeChange={(next) => setTheme(next)}
      variant="circle"
      duration={450}
      className="flex size-9 items-center justify-center rounded-md text-primary transition-colors hover:bg-accent [&_svg]:size-[18px]"
      aria-label="Toggle theme"
    />
  )
}
