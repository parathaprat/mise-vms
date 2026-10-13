"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"

import { usePersona } from "@/hooks/use-demo"
import { cn } from "@/lib/utils"

import { activeSection, isActive } from "./nav"
import { useNavCounts } from "./use-nav-counts"

/** Second level of the two-level nav. Hidden on detail pages and single-page sections. */
export function SectionTabs() {
  const pathname = usePathname()
  const persona = usePersona()
  const counts = useNavCounts()
  const section = activeSection(pathname, persona.id)
  const depth = pathname.split("/").filter(Boolean).length
  if (!section || section.pages.length < 2 || depth > 1) return null

  return (
    <nav aria-label={`${section.title} pages`} className="-mb-2 flex">
      <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border bg-muted/50 p-0.5 [scrollbar-width:none]">
        {section.pages.map((page) => {
          const active = isActive(pathname, page)
          const badge = page.badge ? counts[page.badge] : 0
          return (
            <Link
              key={page.href}
              href={page.href}
              title={page.hint}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1 text-[13px] whitespace-nowrap transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`section-tab-${section.id}`}
                  className="absolute inset-0 rounded-full bg-card shadow-xs ring-1 ring-foreground/8"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              ) : null}
              <span className="relative font-medium">{page.title}</span>
              {badge > 0 ? (
                <span className="relative rounded-full bg-foreground/8 px-1.5 text-[10px] leading-4 font-semibold tabular">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
