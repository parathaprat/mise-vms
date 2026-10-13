"use client"

import { HammerIcon } from "lucide-react"

import { EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={HammerIcon} title="Being assembled" description="This view is being built right now. Check back in a moment." />
    </>
  )
}
