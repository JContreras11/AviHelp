import * as React from "react"

import { cn } from "@/lib/utils"

// Plano (sin base-ui).
function Separator({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="separator" role="separator" className={cn("shrink-0 bg-border h-px w-full", className)} {...props} />
}

export { Separator }
