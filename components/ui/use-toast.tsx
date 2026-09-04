// use-toast.tsx
//
// App-level notification bus, backed by react-toastify. The call-site API
// (`toast({ title, description, variant })` / `useToast()`) is unchanged
// on purpose — over 200 call sites across every sub-app already use this
// shape, and rewriting every one of them to react-toastify's native API
// would be a huge, risky mechanical refactor for zero behavioral gain.
// Only the rendering engine changed (react-hot-toast -> react-toastify);
// the rendered toast card (renderToast below) is pixel-identical to
// before, and every existing caller keeps working verbatim.
//
// react-toastify's own visual theme (background, padding, shadow,
// progress bar, icon) is fully suppressed via the ToastContainer config in
// RootLayoutClient.tsx — this file's renderToast() supplies 100% of the
// visible chrome, same as it did wrapped in react-hot-toast's `.custom()`.
import * as React from "react"
import { toast as toastify } from "react-toastify"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export type ToastVariant = "default" | "destructive"

export interface Toast {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  /** Milliseconds before auto-dismiss. Defaults to 4s (default) / 6s (destructive). */
  duration?: number
}

function renderToast(dismiss: () => void, { title, description, variant = "default" }: Toast) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-md border p-4 pr-8 shadow-lg",
        variant === "destructive"
          ? "border-destructive bg-destructive text-destructive-foreground"
          : "border-border bg-background text-foreground"
      )}
    >
      <div className="grid gap-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {description && <p className="text-sm opacity-90">{description}</p>}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className={cn(
          "absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100",
          variant === "destructive" && "text-destructive-foreground"
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Fires a toast. Works both inside and outside React (e.g. lib/apiFetch.ts
 * calls this from a plain async function), matching the previous API.
 */
function toast(props: Toast) {
  const id = toastify(
    ({ closeToast }) => renderToast(closeToast, props),
    {
      autoClose: props.duration ?? (props.variant === "destructive" ? 6000 : 4000),
      closeButton: false,
      hideProgressBar: true,
      icon: false,
    }
  )
  return {
    id,
    dismiss: () => toastify.dismiss(id),
  }
}

function useToast() {
  return { toast, dismiss: toastify.dismiss }
}

export { useToast, toast }
