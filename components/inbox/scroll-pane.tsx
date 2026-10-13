import type * as React from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * Radix wraps scroll content in a `display: table` div that grows to fit nowrap text, which defeats
 * `truncate` in rows. Forcing it back to block keeps content at the pane's width.
 */
export function ScrollPane({ className, ...props }: React.ComponentProps<typeof ScrollArea>) {
  return <ScrollArea className={cn("min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:block!", className)} {...props} />
}
