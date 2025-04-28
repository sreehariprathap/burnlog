"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "./ThemeProvider"
import { Switch } from "./ui/switch"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex items-center space-x-2">
      <Sun size={18} className="text-primary" />
      <Switch
        checked={theme === "dark"}
        onCheckedChange={(checked) => {
          setTheme(checked ? "dark" : "light")
        }}
        aria-label="Toggle theme"
      />
      <Moon size={18} className="text-primary" />
    </div>
  )
}