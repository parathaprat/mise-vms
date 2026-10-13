import { Skeleton } from "@/components/ui/skeleton"

export function InboxSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-24 shrink-0" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex flex-col gap-0.5 rounded-xl p-2 ring-1 ring-foreground/10 lg:h-[calc(100svh-24rem)] lg:min-h-[28rem]">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2.5">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2 pt-0.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="hidden rounded-xl lg:block lg:h-[calc(100svh-24rem)] lg:min-h-[28rem]" />
      </div>
    </>
  )
}
