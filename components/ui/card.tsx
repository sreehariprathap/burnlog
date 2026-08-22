import * as React from "react"
import { useId } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { GlassFilter } from "@/components/kokonutui/glass-filter"

const cardVariants = cva("", {
  variants: {
    glassSize: {
      sm: "p-3 gap-3",
      default: "py-6 gap-6",
      lg: "p-8 gap-8",
    },
  },
  defaultVariants: {
    glassSize: "default",
  },
})

type CardProps = React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    glassEffect?: boolean
  }

function Card({ className, glassSize, glassEffect = true, style, children, ...rest }: CardProps) {
  const filterId = useId()

  return (
    <div
      data-slot="card"
      className={cn(
        "group relative flex flex-col rounded-xl text-card-foreground overflow-hidden",
        cardVariants({ glassSize }),
        className
      )}
      style={style}
      {...rest}
    >
      {glassEffect && <GlassFilter id={filterId} scale={30} />}
      {/* Background-only layer: the displacement filter distorts this layer's
          own translucent fill + backdrop-blur, never the text/content on top. */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/10 bg-background/20 backdrop-blur-[2px]"
        style={{
          boxShadow: "var(--glass-shadow)",
          filter: glassEffect ? `url(#glass-distortion-${filterId})` : undefined,
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-r from-transparent via-black/5 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-[inherit]">{children}</div>
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
