import type { Metadata } from "next"

import { RatesPage } from "@/components/program/rates/rates-page"

export const metadata: Metadata = { title: "Rate cards" }

export default function Page() {
  return <RatesPage />
}
