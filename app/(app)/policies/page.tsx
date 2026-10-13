import type { Metadata } from "next"

import { PoliciesPage } from "@/components/program/policies/policies-page"

export const metadata: Metadata = { title: "Policies" }

export default function Page() {
  return <PoliciesPage />
}
