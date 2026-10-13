import type { Metadata } from "next"

import { ProProfile } from "@/components/workforce/pro-profile"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return { title: `${id} · Workforce` }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProProfile id={decodeURIComponent(id)} />
}
