"use client"

import * as React from "react"

import { Mark } from "@/components/app/identity"
import { TimeAgo } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Activity } from "@/lib/types"

import { nameHue } from "../shared"

const COLLAPSED = 6

export function PolicyHistory({ activities, className }: { activities: Activity[]; className?: string }) {
  const [expanded, setExpanded] = React.useState(false)
  const shown = expanded ? activities : activities.slice(0, COLLAPSED)
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Change history</h2>
        </CardTitle>
        <CardDescription>Policies, cost centers and supplier distribution, who changed what, and when.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes logged since cutover.</p>
        ) : (
          <ol className="flex flex-col">
            {shown.map((a) => (
              <li
                key={a.id}
                className="relative flex gap-3 pb-4 last:pb-0 before:absolute before:top-7 before:bottom-1 before:left-2.5 before:w-px before:bg-border last:before:hidden"
              >
                <Mark label={a.actor} hue={nameHue(a.actor)} size="xs" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm text-pretty">{a.text}</p>
                  <TimeAgo value={a.at} className="w-fit text-xs text-muted-foreground" />
                </div>
              </li>
            ))}
          </ol>
        )}
        {activities.length > COLLAPSED ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? "Show less" : `Show ${activities.length - COLLAPSED} more`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
