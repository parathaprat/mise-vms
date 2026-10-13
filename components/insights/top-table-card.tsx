"use client"

import * as React from "react"
import { ListOrderedIcon } from "lucide-react"

import { VenueMark } from "@/components/app/identity"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { compactMoney, hours, money, num, pct } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ChartCard } from "./chart-card"
import { FILL_TARGET, type Insights, type TopRow } from "./compute"

type View = "primary" | "positions"

interface TopTableCardProps {
  top: Insights["top"]
  onSelectVenue?: (venueId: string) => void
}

export function TopTableCard({ top, onSelectVenue }: TopTableCardProps) {
  const [view, setView] = React.useState<View>("primary")
  const primaryLabel = top.primaryDimension === "venue" ? "Venues" : "Cost centers"
  const rows = view === "primary" ? top.primary : top.positions
  const nameHeader = view === "primary" ? (top.primaryDimension === "venue" ? "Venue" : "Cost center") : "Position"
  const canFilter = view === "primary" && top.primaryDimension === "venue" && !!onSelectVenue && top.primary.length > 1

  return (
    <ChartCard
      title={view === "primary" ? `Top ${primaryLabel.toLowerCase()}` : "Top positions"}
      description={canFilter ? "Ranked by spend in range. Select a venue to focus the page." : "Ranked by spend in range."}
      action={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={view}
          onValueChange={(value) => {
            if (value === "primary" || value === "positions") setView(value)
          }}
          aria-label="Rank by"
        >
          <ToggleGroupItem value="primary" className="px-2.5">
            {primaryLabel}
          </ToggleGroupItem>
          <ToggleGroupItem value="positions" className="px-2.5">
            Positions
          </ToggleGroupItem>
        </ToggleGroup>
      }
      empty={
        rows.length === 0
          ? {
              icon: ListOrderedIcon,
              title: "Nothing to rank yet",
              description: "Rankings appear once shifts in this range are worked.",
            }
          : null
      }
      contentClassName="px-0"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">{nameHeader}</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Fill</TableHead>
            <TableHead className="pr-4 text-right">Avg bill</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-56 pl-4">
                {canFilter && row.venue ? (
                  <button
                    type="button"
                    onClick={() => onSelectVenue?.(row.id)}
                    className="group/venue flex min-w-0 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <VenueMark venue={row.venue} size="sm" />
                    <span className="truncate font-medium group-hover/venue:underline group-hover/venue:underline-offset-4">
                      {row.label}
                    </span>
                  </button>
                ) : (
                  <div className="flex min-w-0 items-center gap-2.5">
                    {row.venue ? <VenueMark venue={row.venue} size="sm" /> : null}
                    <span className="truncate font-medium">{row.label}</span>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right tabular">
                <span title={money(row.spend)}>{compactMoney(row.spend)}</span>
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular">{hours(Math.round(row.hours))}</TableCell>
              <TableCell className="text-right">
                <FillValue row={row} />
              </TableCell>
              <TableCell className="pr-4 text-right tabular">
                {row.avgBill !== null ? `$${row.avgBill.toFixed(2)}` : <span className="text-muted-foreground">–</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ChartCard>
  )
}

function FillValue({ row }: { row: TopRow }) {
  if (row.fillRate === null) return <span className="text-muted-foreground">–</span>
  const tone =
    row.fillRate >= FILL_TARGET ? "text-success" : row.fillRate >= 0.85 ? "text-foreground" : "text-destructive"
  return (
    <span className={cn("tabular", tone)} title={`${num(row.filled)} of ${num(row.slots)} slots filled`}>
      {pct(row.fillRate)}
    </span>
  )
}
