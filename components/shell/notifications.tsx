"use client"

import { useRouter } from "next/navigation"
import {
  BadgeDollarSignIcon,
  BellIcon,
  BellOffIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  CoinsIcon,
  MessageSquareIcon,
  ReceiptTextIcon,
  ShieldAlertIcon,
  TimerIcon,
  UserCheckIcon,
  UserRoundXIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"

import { TimeAgo } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useData, usePersona } from "@/hooks/use-demo"
import { useStore } from "@/lib/store"
import type { ActivityKind } from "@/lib/types"
import { cn } from "@/lib/utils"

export const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  request: ClipboardListIcon,
  approval: CheckCheckIcon,
  fill: UserCheckIcon,
  checkin: UserCheckIcon,
  noshow: UserRoundXIcon,
  timesheet: TimerIcon,
  tips: CoinsIcon,
  invoice: ReceiptTextIcon,
  payment: BadgeDollarSignIcon,
  rate: BadgeDollarSignIcon,
  policy: ShieldAlertIcon,
  roster: UsersRoundIcon,
  message: MessageSquareIcon,
  change: ClipboardListIcon,
  alert: ShieldAlertIcon,
}

export function NotificationsPopover() {
  const persona = usePersona()
  const all = useData((d) => d.notifications)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const router = useRouter()
  const items = all.filter((n) => n.personas.includes(persona.id)).slice(0, 40)
  const unread = items.filter((n) => !n.read).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <BellIcon />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Notifications</span>
            <span className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={!unread}>
            <CheckCheckIcon data-icon="inline-start" />
            Mark all read
          </Button>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
            <BellOffIcon className="size-5" />
            No notifications yet.
          </div>
        ) : (
          <ScrollArea className="h-[min(26rem,60vh)]">
            <ul className="flex flex-col py-1">
              {items.map((n) => {
                const Icon = ACTIVITY_ICON[n.kind] ?? BellIcon
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        markRead(n.id)
                        if (n.href) router.push(n.href)
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60",
                        !n.read && "bg-primary/[0.035]"
                      )}
                    >
                      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted", !n.read && "bg-primary/10 text-primary")}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{n.title}</span>
                          {!n.read ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                        <TimeAgo value={n.at} className="text-[11px] text-muted-foreground/80" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
