"use client"

import * as React from "react"

const DESKTOP_QUERY = "(min-width: 64rem)"

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

const getSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches
const getServerSnapshot = () => false

/** Matches Tailwind's `lg` breakpoint, where the inbox switches to two panes. */
export function useIsDesktop(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
