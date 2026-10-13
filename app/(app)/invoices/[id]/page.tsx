import type { Metadata } from "next"

import { InvoiceDetail } from "@/components/invoices/invoice-detail"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return { title: id }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InvoiceDetail id={decodeURIComponent(id)} />
}
