import type { Metadata } from "next"

import { SuppliersPage } from "@/components/program/suppliers/suppliers-page"

export const metadata: Metadata = { title: "Suppliers" }

export default function Page() {
  return <SuppliersPage />
}
