"use client"

import { usePersona } from "@/hooks/use-demo"

import { ProgramHome } from "./program-home"
import { SupplierHome } from "./supplier-home"
import { VenueHome } from "./venue-home"

export function HomePage() {
  const persona = usePersona()
  if (persona.id === "program") return <ProgramHome />
  if (persona.id === "supplier") return <SupplierHome />
  return <VenueHome />
}
