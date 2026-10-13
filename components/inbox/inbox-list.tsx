"use client"

import * as React from "react"

import { CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { money } from "@/lib/format"
import type { InboxItem } from "@/lib/selectors"
import { cn } from "@/lib/utils"

import { InboxTime } from "./inbox-time"
import { KIND_META, PRIORITY_TONE } from "./kinds"
import { ScrollPane } from "./scroll-pane"

export function optionId(itemId: string): string {
  return `inbox-option-${itemId}`
}

interface InboxListProps {
  heading: string
  items: InboxItem[]
  selectedId?: string
  primaryLabel?: string
  listRef?: React.Ref<HTMLDivElement>
  onSelect: (index: number) => void
  onOpen: (item: InboxItem) => void
}

export function InboxList({ heading, items, selectedId, primaryLabel, listRef, onSelect, onOpen }: InboxListProps) {
  const titleId = React.useId()
  return (
    <>
      <CardHeader className="border-b pt-4">
        <CardTitle id={titleId} role="heading" aria-level={2}>
          {heading} <span className="font-normal text-muted-foreground tabular">· {items.length}</span>
        </CardTitle>
        <CardAction className="text-xs text-muted-foreground">Most urgent first</CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        <ScrollPane>
          <div
            ref={listRef}
            role="listbox"
            aria-labelledby={titleId}
            tabIndex={0}
            aria-activedescendant={selectedId ? optionId(selectedId) : undefined}
            data-inbox-list=""
            className="group/list flex flex-col gap-0.5 p-2 outline-none"
          >
            {items.map((item, index) => (
              <InboxRow
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => onSelect(index)}
                onOpen={() => onOpen(item)}
              />
            ))}
          </div>
        </ScrollPane>
      </CardContent>
      <CardFooter className="hidden flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-muted-foreground md:flex">
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          Move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          Open
        </span>
        {primaryLabel ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Kbd>A</Kbd>
            <span className="truncate">{primaryLabel}</span>
          </span>
        ) : null}
      </CardFooter>
    </>
  )
}

function InboxRow({ item, selected, onSelect, onOpen }: { item: InboxItem; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const { icon: Icon, label } = KIND_META[item.kind]
  return (
    <div
      id={optionId(item.id)}
      role="option"
      aria-selected={selected}
      data-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        "relative flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors select-none hover:bg-muted/60",
        "before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity",
        "data-selected:bg-muted data-selected:before:opacity-100",
        "group-focus-visible/list:data-selected:ring-2 group-focus-visible/list:data-selected:ring-ring/50"
      )}
    >
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", PRIORITY_TONE[item.priority])}>
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {item.priority === "high" ? <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-label="Urgent" role="img" /> : null}
          <span className="truncate text-sm font-medium">{item.title}</span>
          <InboxTime item={item} className="ml-auto" />
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
          {item.amount != null ? <span className="ml-auto shrink-0 text-xs font-medium tabular">{money(item.amount)}</span> : null}
        </div>
      </div>
    </div>
  )
}
