"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Tabs planos (sin base-ui). base-ui Tabs disparaba re-render storms/freeze con React 19.
const TabsCtx = React.createContext<{ value: string; setValue: (v: string) => void }>({
  value: "",
  setValue: () => {},
})

function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  className?: string
  children?: React.ReactNode
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "")
  const val = value ?? internal
  const setValue = React.useCallback(
    (v: string) => (onValueChange ? onValueChange(v) : setInternal(v)),
    [onValueChange],
  )
  return (
    <TabsCtx.Provider value={{ value: val, setValue }}>
      <div data-slot="tabs" className={cn("flex flex-col gap-2", className)}>{children}</div>
    </TabsCtx.Provider>
  )
}

function TabsList({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div role="tablist" data-slot="tabs-list"
      className={cn("inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground", className)}>
      {children}
    </div>
  )
}

function TabsTrigger({ value, className, children }: { value: string; className?: string; children?: React.ReactNode }) {
  const { value: active, setValue } = React.useContext(TabsCtx)
  const on = active === value
  return (
    <button type="button" role="tab" aria-selected={on} data-state={on ? "active" : "inactive"}
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none",
        on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        className,
      )}>
      {children}
    </button>
  )
}

function TabsContent({ value, className, children }: { value: string; className?: string; children?: React.ReactNode }) {
  const { value: active } = React.useContext(TabsCtx)
  if (active !== value) return null
  return <div role="tabpanel" data-slot="tabs-content" className={cn("flex-1 text-sm outline-none", className)}>{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
