"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Ripple tint per variant: light ripple on filled buttons, primary tint on the rest.
function rippleColorFor(variant: ButtonProps["variant"]): string {
  switch (variant) {
    case "outline":
    case "ghost":
    case "link":
      return "var(--primary)"
    default:
      return "var(--primary-foreground)"
  }
}

type Ripple = { x: number; y: number; size: number; key: number }

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Override the ripple color. Defaults to a sensible value per variant. */
    rippleColor?: string
    /** Ripple animation duration in ms. */
    rippleDuration?: number
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  rippleColor,
  rippleDuration = 600,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const [ripples, setRipples] = React.useState<Ripple[]>([])
  const seq = React.useRef(0)

  // `asChild` (Slot) hosts arbitrary children (e.g. <Link>) — skip ripple state there.
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        onClick={onClick}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  const color = rippleColor ?? rippleColorFor(variant)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    const rect = button.getBoundingClientRect()
    const rippleSize = Math.max(rect.width, rect.height)
    const x = event.clientX - rect.left - rippleSize / 2
    const y = event.clientY - rect.top - rippleSize / 2
    const key = seq.current++
    setRipples((prev) => [...prev, { x, y, size: rippleSize, key }])
    window.setTimeout(
      () => setRipples((prev) => prev.filter((r) => r.key !== key)),
      rippleDuration
    )
    onClick?.(event)
  }

  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={handleClick}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
      <span className="pointer-events-none absolute inset-0 z-0">
        {ripples.map((ripple) => (
          <span
            key={ripple.key}
            className="animate-rippling absolute rounded-full opacity-30"
            style={
              {
                width: `${ripple.size}px`,
                height: `${ripple.size}px`,
                top: `${ripple.y}px`,
                left: `${ripple.x}px`,
                backgroundColor: color,
                transform: "scale(0)",
                "--duration": `${rippleDuration}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </span>
    </button>
  )
}

export { Button, buttonVariants }
