"use client"

import { cn } from "@/lib/utils"

// Plano (sin base-ui). value 0..100.
function Progress({ className, value = 0 }: { className?: string; value?: number }) {
  return (
    <div data-slot="progress" className={cn("relative h-1 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export { Progress }
