"use client"

import { AnimatePresence, motion } from "motion/react"
import { CheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { hours, money, num } from "@/lib/format"

import type { EntryTotals } from "./model"

interface BulkBarProps {
  totals: EntryTotals
  onApprove: () => void
  onClear: () => void
}

export function BulkBar({ totals, onApprove, onClear }: BulkBarProps) {
  return (
    <AnimatePresence>
      {totals.count > 0 ? (
        <motion.div
          key="bulk-bar"
          role="region"
          aria-label="Selected timesheets"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-4 text-popover-foreground shadow-lg"
        >
          <span className="text-sm whitespace-nowrap tabular">
            <span className="font-medium">{num(totals.count)} selected</span>
            <span className="text-muted-foreground">
              {" "}
              · {hours(totals.hours)} · {money(totals.amount, true)}
            </span>
          </span>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={onApprove}>
              <CheckIcon data-icon="inline-start" />
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear}>
              Clear
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
