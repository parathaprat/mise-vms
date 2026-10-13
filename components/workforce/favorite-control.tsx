"use client"

import { ChevronDownIcon, StarIcon } from "lucide-react"
import { toast } from "sonner"

import { VenueMark } from "@/components/app/identity"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { workerName } from "@/lib/format"
import { getActions } from "@/lib/store"
import type { Venue, Worker } from "@/lib/types"
import { cn } from "@/lib/utils"

export function toggleFavorite(venue: Venue, worker: Worker, isFavorite: boolean) {
  getActions().toggleFavorite(venue.id, worker.id)
  if (isFavorite) {
    toast(`${workerName(worker)} removed from ${venue.shortName} favorites`)
  } else {
    toast.success(`${workerName(worker)} added to ${venue.shortName} favorites`, {
      description: "They'll get first look at new shifts there.",
    })
  }
}

interface FavoriteVenueItemsProps {
  worker: Worker
  venues: Venue[]
  favoriteVenueIds: string[]
  blockedVenueIds: string[]
  label?: string
}

/** Checkbox items for favoriting a Pro at each eligible venue; render inside a DropdownMenuContent. */
export function FavoriteVenueItems({ worker, venues, favoriteVenueIds, blockedVenueIds, label = "Favorite at" }: FavoriteVenueItemsProps) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {venues.map((venue) => {
        const checked = favoriteVenueIds.includes(venue.id)
        const blocked = blockedVenueIds.includes(venue.id)
        return (
          <DropdownMenuCheckboxItem
            key={venue.id}
            checked={checked}
            disabled={blocked}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggleFavorite(venue, worker, checked)}
          >
            <VenueMark venue={venue} size="xs" />
            <span className="truncate">{venue.shortName}</span>
            {blocked ? <span className="ml-auto text-xs text-muted-foreground">Do-not-return</span> : null}
          </DropdownMenuCheckboxItem>
        )
      })}
    </DropdownMenuGroup>
  )
}

interface FavoriteControlProps {
  worker: Worker
  venues: Venue[]
  favoriteVenueIds: string[]
  blockedVenueIds: string[]
  variant?: "button" | "icon"
  className?: string
}

export function FavoriteControl({ worker, venues, favoriteVenueIds, blockedVenueIds, variant = "button", className }: FavoriteControlProps) {
  if (venues.length === 0) return null
  const favCount = venues.filter((v) => favoriteVenueIds.includes(v.id)).length
  const isFavorite = favCount > 0
  const name = workerName(worker)
  const star = <StarIcon data-icon={variant === "button" ? "inline-start" : undefined} className={cn(isFavorite && "fill-warning text-warning")} />

  if (venues.length === 1) {
    const venue = venues[0]
    const blocked = blockedVenueIds.includes(venue.id)
    const label = isFavorite ? `Remove ${name} from ${venue.shortName} favorites` : `Add ${name} to ${venue.shortName} favorites`
    if (variant === "icon") {
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          className={className}
          disabled={blocked}
          aria-pressed={isFavorite}
          aria-label={label}
          title={blocked ? "On the do-not-return list" : label}
          onClick={() => toggleFavorite(venue, worker, isFavorite)}
        >
          {star}
        </Button>
      )
    }
    return (
      <Button
        variant="outline"
        className={className}
        disabled={blocked}
        aria-pressed={isFavorite}
        aria-label={label}
        onClick={() => toggleFavorite(venue, worker, isFavorite)}
      >
        {star}
        {isFavorite ? "Favorite" : "Add to favorites"}
      </Button>
    )
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon-sm" className={className} aria-label={`Favorite ${name} at a venue`}>
            {star}
          </Button>
        ) : (
          <Button variant="outline" className={className}>
            {star}
            {isFavorite ? `Favorite · ${favCount}` : "Add to favorites"}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <FavoriteVenueItems worker={worker} venues={venues} favoriteVenueIds={favoriteVenueIds} blockedVenueIds={blockedVenueIds} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
