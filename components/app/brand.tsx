import { BRAND_NAME } from "@/lib/reference"
import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <circle cx="11.5" cy="11.5" r="3.3" className="fill-background" />
      <circle cx="20.5" cy="11.5" r="3.3" className="fill-background" fillOpacity="0.45" />
      <circle cx="11.5" cy="20.5" r="3.3" className="fill-background" fillOpacity="0.45" />
      <rect x="17.2" y="17.2" width="6.6" height="6.6" rx="2" className="fill-brand" />
    </svg>
  )
}

export function BrandLockup({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="font-heading text-[15px] font-semibold tracking-tight">{BRAND_NAME}</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
    </div>
  )
}
