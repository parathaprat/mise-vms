"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRightIcon,
  CheckIcon,
  CircleIcon,
  PlayIcon,
  SparklesIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useSearchParams } from "next/navigation"

import { BrandMark } from "@/components/app/brand"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CameraPath = {
  from: { x: number; y: number; scale: number; rotate: number }
  to: { x: number; y: number; scale: number; rotate: number }
  origin: string
}

interface Scene {
  id: string
  startsAt: number
  endsAt: number
  eyebrow: string
  title: string
  detail: string
  href: string
  accent: string
  view: string
  callout: string
  calloutPos: string
  camera: CameraPath
  enterFrom: "right" | "left" | "up" | "scale"
}

const DURATION = 43
const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: "spring" as const, stiffness: 180, damping: 22 }

const SCENES: Scene[] = [
  {
    id: "home",
    startsAt: 3.8,
    endsAt: 9,
    eyebrow: "Your day",
    title: "Everything that matters. Right where you expect it.",
    detail: "Live staffing, decisions and the week ahead.",
    href: "/?reel=1",
    accent: "Today is under control",
    view: "Home",
    callout: "Right now",
    calloutPos: "left-[12%] top-[28%]",
    enterFrom: "right",
    camera: {
      origin: "42% 18%",
      from: { x: 0, y: 18, scale: 1.02, rotate: -0.6 },
      to: { x: -18, y: -28, scale: 1.12, rotate: 0.4 },
    },
  },
  {
    id: "request",
    startsAt: 9,
    endsAt: 14.5,
    eyebrow: "Request staff",
    title: "Start with one sentence.",
    detail: "Dates, rates and shift details fall into place.",
    href: "/requests/new?reel=1",
    accent: "12 bartenders · Saturday · Wrigley",
    view: "New request",
    callout: "Natural language",
    calloutPos: "right-[10%] top-[34%]",
    enterFrom: "up",
    camera: {
      origin: "50% 30%",
      from: { x: 24, y: 10, scale: 1.04, rotate: 0.8 },
      to: { x: -8, y: -36, scale: 1.16, rotate: -0.3 },
    },
  },
  {
    id: "schedule",
    startsAt: 14.5,
    endsAt: 20,
    eyebrow: "Live operations",
    title: "See the week take shape.",
    detail: "Every confirmation, check-in and open shift.",
    href: "/schedule?view=week&reel=1",
    accent: "Staffing updates live",
    view: "Schedule",
    callout: "Live fill",
    calloutPos: "left-[18%] bottom-[22%]",
    enterFrom: "left",
    camera: {
      origin: "62% 48%",
      from: { x: -30, y: 12, scale: 1.05, rotate: -0.5 },
      to: { x: 16, y: -22, scale: 1.18, rotate: 0.5 },
    },
  },
  {
    id: "decisions",
    startsAt: 20,
    endsAt: 25.5,
    eyebrow: "Approvals",
    title: "One queue. One clear next step.",
    detail: "The right context and action travel together.",
    href: "/inbox?reel=1",
    accent: "Approve with confidence",
    view: "To do",
    callout: "One click",
    calloutPos: "right-[14%] top-[40%]",
    enterFrom: "scale",
    camera: {
      origin: "48% 42%",
      from: { x: 0, y: 20, scale: 1.08, rotate: 0 },
      to: { x: -12, y: -18, scale: 1.2, rotate: -0.4 },
    },
  },
  {
    id: "time",
    startsAt: 25.5,
    endsAt: 30,
    eyebrow: "Time",
    title: "Clean hours move on their own.",
    detail: "Your attention stays on the exceptions.",
    href: "/timesheets?reel=1",
    accent: "Geofenced and ready",
    view: "Timesheets",
    callout: "Exceptions only",
    calloutPos: "left-[14%] top-[36%]",
    enterFrom: "right",
    camera: {
      origin: "55% 40%",
      from: { x: 20, y: 8, scale: 1.03, rotate: 0.6 },
      to: { x: -22, y: -30, scale: 1.14, rotate: -0.2 },
    },
  },
  {
    id: "invoices",
    startsAt: 30,
    endsAt: 35,
    eyebrow: "Payments",
    title: "From approved time to a clear invoice.",
    detail: "Every line is connected. Every payment is matched.",
    href: "/invoices?reel=1",
    accent: "Nothing left to reconcile",
    view: "Invoices",
    callout: "Matched lines",
    calloutPos: "right-[12%] bottom-[26%]",
    enterFrom: "up",
    camera: {
      origin: "58% 36%",
      from: { x: -16, y: 16, scale: 1.04, rotate: -0.7 },
      to: { x: 10, y: -24, scale: 1.15, rotate: 0.3 },
    },
  },
  {
    id: "insights",
    startsAt: 35,
    endsAt: 39.3,
    eyebrow: "Insights",
    title: "See the whole program clearly.",
    detail: "Spend, fill and quality in one calm view.",
    href: "/insights?reel=1",
    accent: "Ready for the next decision",
    view: "Insights",
    callout: "Program pulse",
    calloutPos: "left-[16%] top-[30%]",
    enterFrom: "scale",
    camera: {
      origin: "50% 50%",
      from: { x: 0, y: 14, scale: 1.06, rotate: 0.2 },
      to: { x: -8, y: -20, scale: 1.17, rotate: -0.3 },
    },
  },
]

function sceneAt(time: number): Scene | undefined {
  return SCENES.find((scene) => time >= scene.startsAt && time < scene.endsAt)
}

function enterOffset(from: Scene["enterFrom"]) {
  switch (from) {
    case "left":
      return { x: -90, y: 18, scale: 0.92, rotateY: 8 }
    case "up":
      return { x: 0, y: 70, scale: 0.9, rotateY: 0 }
    case "scale":
      return { x: 0, y: 10, scale: 0.84, rotateY: 0 }
    default:
      return { x: 90, y: 18, scale: 0.92, rotateY: -8 }
  }
}

function WordReveal({
  text,
  active,
  className,
  delay = 0,
}: {
  text: string
  active: boolean
  className?: string
  delay?: number
}) {
  const words = text.split(" ")
  return (
    <span className={cn("inline-flex flex-wrap gap-x-[0.28em]", className)}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className="overflow-hidden pb-[0.12em]">
          <motion.span
            className="inline-block"
            initial={false}
            animate={
              active
                ? { y: "0%", opacity: 1, rotateX: 0 }
                : { y: "110%", opacity: 0, rotateX: -40 }
            }
            transition={{
              delay: delay + index * 0.045,
              duration: 0.7,
              ease: EASE,
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

function AmbientField({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-[20%] left-[45%] size-[55vw] rounded-full bg-[radial-gradient(circle,rgba(205,255,77,0.28),transparent_60%)] blur-3xl"
        animate={
          active
            ? { x: [0, 40, -20, 0], y: [0, 30, -10, 0], scale: [1, 1.08, 0.96, 1] }
            : { opacity: 0.4 }
        }
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[15%] left-[-10%] size-[45vw] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.55),transparent_65%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_65%)]"
        animate={
          active
            ? { x: [0, 30, -40, 0], y: [0, -25, 15, 0] }
            : { opacity: 0.3 }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[35%] right-[-8%] size-[28vw] rounded-full bg-[radial-gradient(circle,rgba(32,32,30,0.08),transparent_70%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(255,255,255,0.05),transparent_70%)]"
        animate={active ? { x: [0, -25, 10, 0], y: [0, 20, -15, 0] } : {}}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 [background-image:url('data:image/svg+xml,%3Csvg_viewBox=%220_0_160_160%22_xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter_id=%22n%22%3E%3CfeTurbulence_type=%22fractalNoise%22_baseFrequency=%22.9%22_numOctaves=%222%22_stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect_width=%22100%25%22_height=%22100%25%22_filter=%22url(%23n)%22_opacity=%22.8%22/%3E%3C/svg%3E')] opacity-[0.04]" />
    </div>
  )
}

function CutFlash({ flashKey }: { flashKey: string }) {
  return (
    <AnimatePresence>
      <motion.div
        key={flashKey}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-40 mix-blend-soft-light"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        style={{
          background:
            "radial-gradient(circle at 60% 40%, rgba(255,255,255,0.85), transparent 55%), linear-gradient(120deg, rgba(205,255,77,0.35), transparent 45%)",
        }}
      />
    </AnimatePresence>
  )
}

function ProgressRail({
  progress,
  time,
  activeId,
}: {
  progress: number
  time: number
  activeId?: string
}) {
  return (
    <div className="absolute inset-x-[5vw] bottom-[3.2vh] z-30 flex items-center gap-4">
      <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-foreground/10">
        <motion.div
          className="absolute inset-y-0 left-0 origin-left rounded-full bg-foreground/60"
          animate={{ scaleX: progress }}
          transition={{ duration: 0.1, ease: "linear" }}
        />
        {SCENES.map((scene) => {
          const mark = scene.startsAt / DURATION
          return (
            <motion.span
              key={scene.id}
              className={cn(
                "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                time >= scene.startsAt ? "bg-brand" : "bg-foreground/20"
              )}
              style={{ left: `${mark * 100}%` }}
              animate={
                activeId === scene.id
                  ? { scale: [1, 1.8, 1], opacity: [1, 0.7, 1] }
                  : { scale: 1, opacity: 1 }
              }
              transition={{ duration: 0.7, ease: EASE }}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-1.5">
        {SCENES.map((scene) => (
          <motion.span
            key={scene.id}
            className={cn(
              "h-1.5 rounded-full",
              activeId === scene.id
                ? "w-5 bg-brand"
                : time >= scene.endsAt
                  ? "w-1.5 bg-foreground/45"
                  : "w-1.5 bg-foreground/15"
            )}
            layout
            transition={SPRING}
          />
        ))}
      </div>
    </div>
  )
}

export function ShowcaseReel() {
  const { setTheme } = useTheme()
  const params = useSearchParams()
  const auto = params.get("auto") === "1"
  const [started, setStarted] = React.useState(false)
  const [time, setTime] = React.useState(0)
  const [flashKey, setFlashKey] = React.useState("boot")
  const startedAt = React.useRef(0)
  const lastScene = React.useRef<string | null>(null)

  React.useEffect(() => {
    setTheme("light")
  }, [setTheme])

  React.useEffect(() => {
    if (!auto || started) return
    const timer = window.setTimeout(() => {
      startedAt.current = performance.now()
      setTime(0)
      setStarted(true)
      setFlashKey("intro")
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [auto, started])

  React.useEffect(() => {
    if (!started) return
    let frame = 0
    const tick = (now: number) => {
      const elapsed = Math.min(DURATION, (now - startedAt.current) / 1000)
      setTime(elapsed)
      if (elapsed < DURATION) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [started])

  const active = sceneAt(time)
  const intro = started && time < 3.8
  const outro = started && time >= 39.3

  React.useEffect(() => {
    const id = active?.id ?? (intro ? "intro" : outro ? "outro" : null)
    if (!id || id === lastScene.current) return
    lastScene.current = id
    setFlashKey(`${id}-${Math.round(time * 10)}`)
  }, [active?.id, intro, outro, time])

  const start = () => {
    startedAt.current = performance.now()
    setTime(0)
    setStarted(true)
    setFlashKey("intro")
    lastScene.current = null
  }

  return (
    <main
      className={cn(
        "relative min-h-svh overflow-hidden bg-[#f4f3ef] text-[#20201e] dark:bg-[#252522] dark:text-[#f2f1ed]",
        started && "cursor-none"
      )}
    >
      <AmbientField active={started} />
      {started ? <CutFlash flashKey={flashKey} /> : null}

      {!started ? (
        <div className="relative z-20 flex min-h-svh items-center justify-center p-8">
          <motion.div
            className="flex max-w-lg flex-col items-center gap-7 text-center"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <motion.div
              animate={{ y: [0, -6, 0], rotate: [0, -2, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <BrandMark className="size-16 shadow-2xl shadow-brand/20" />
            </motion.div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                Product reel · 43 seconds
              </span>
              <h1 className="font-heading text-5xl font-semibold tracking-[-0.045em] text-balance">
                Mise, in motion.
              </h1>
              <p className="text-base text-pretty text-muted-foreground">
                Seven moments. One connected staffing experience.
              </p>
            </div>
            <Button size="lg" onClick={start} className="rounded-full px-6">
              <PlayIcon data-icon="inline-start" fill="currentColor" />
              Play reel
            </Button>
          </motion.div>
        </div>
      ) : null}

      {started ? (
        <>
          <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-[5vw] pt-[4vh]">
            <motion.div
              className="flex items-center gap-2.5"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <BrandMark className="size-8" />
              <span className="font-heading text-sm font-semibold tracking-tight">
                Mise
              </span>
            </motion.div>
            <motion.div
              className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={active?.view ?? (intro ? "Introducing" : "Mise")}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {active?.view ?? (intro ? "Introducing" : "Mise")}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="size-1 rounded-full bg-brand"
                animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
              <span className="tabular">
                {Math.min(DURATION, Math.ceil(time))} / {DURATION}
              </span>
            </motion.div>
          </header>

          <AnimatePresence mode="wait">
            {intro ? <Intro key="intro" /> : null}
            {outro ? <Outro key="outro" /> : null}
          </AnimatePresence>

          <ProgressRail
            progress={time / DURATION}
            time={time}
            activeId={active?.id}
          />
        </>
      ) : null}

      {SCENES.map((scene) => (
        <ProductScene
          key={scene.id}
          scene={scene}
          active={started && active?.id === scene.id}
          localTime={Math.max(0, time - scene.startsAt)}
        />
      ))}
    </main>
  )
}

function Intro() {
  return (
    <motion.section
      className="absolute inset-0 z-10 flex items-center justify-center px-[10vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.06, filter: "blur(16px)" }}
      transition={{ duration: 0.75, ease: EASE }}
    >
      <div className="relative flex max-w-5xl flex-col items-center gap-6 text-center">
        <motion.div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-[min(70vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/30"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 1.15, 1.35], opacity: [0, 0.55, 0] }}
          transition={{ duration: 2.4, ease: EASE }}
        />
        <motion.div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-[min(48vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/10"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.05, 1.2], opacity: [0, 0.4, 0] }}
          transition={{ delay: 0.15, duration: 2.2, ease: EASE }}
        />
        <motion.div
          initial={{ y: 22, opacity: 0, scale: 0.82, rotate: -10 }}
          animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, ...SPRING }}
        >
          <BrandMark className="size-[clamp(4rem,7vw,7rem)] shadow-2xl shadow-brand/30" />
        </motion.div>
        <h1 className="font-heading text-[clamp(3.3rem,7vw,7.5rem)] leading-[0.92] font-semibold tracking-[-0.065em] text-balance">
          <WordReveal text="Staffing, in its place." active delay={0.35} />
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 1.05, duration: 0.7, ease: EASE }}
          className="max-w-xl text-[clamp(1rem,1.5vw,1.35rem)] text-pretty text-muted-foreground"
        >
          One calm workspace, from request to payment.
        </motion.p>
      </div>
    </motion.section>
  )
}

function ProductScene({
  scene,
  active,
  localTime,
}: {
  scene: Scene
  active: boolean
  localTime: number
}) {
  const duration = scene.endsAt - scene.startsAt
  const t = Math.min(1, localTime / duration)
  const offset = enterOffset(scene.enterFrom)
  const cam = scene.camera
  const x = cam.from.x + (cam.to.x - cam.from.x) * t
  const y = cam.from.y + (cam.to.y - cam.from.y) * t
  const scale = cam.from.scale + (cam.to.scale - cam.from.scale) * t
  const rotate = cam.from.rotate + (cam.to.rotate - cam.from.rotate) * t

  return (
    <motion.section
      aria-hidden={!active}
      className={cn(
        "pointer-events-none absolute inset-0 grid grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.65fr)] items-center gap-[5vw] px-[6vw] pt-[8vh] pb-[7vh]",
        active ? "z-10" : "z-0"
      )}
      initial={false}
      animate={{
        opacity: active ? 1 : 0,
        filter: active ? "blur(0px)" : "blur(10px)",
      }}
      transition={{ duration: 0.65, ease: EASE }}
    >
      <div className="relative z-20 flex min-w-0 flex-col items-start gap-6">
        <motion.div
          initial={false}
          animate={
            active
              ? { opacity: 1, x: 0, filter: "blur(0px)" }
              : { opacity: 0, x: -24, filter: "blur(6px)" }
          }
          transition={{ delay: 0.08, duration: 0.55, ease: EASE }}
          className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
        >
          <motion.span
            className="h-px origin-left bg-brand"
            initial={false}
            animate={active ? { width: 28, opacity: 1 } : { width: 0, opacity: 0 }}
            transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
          />
          {scene.eyebrow}
        </motion.div>

        <div className="flex flex-col gap-4">
          <h2 className="font-heading text-[clamp(2.7rem,4.5vw,5.5rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-balance [perspective:800px]">
            <WordReveal text={scene.title} active={active} delay={0.14} />
          </h2>
          <motion.p
            initial={false}
            animate={
              active
                ? { y: 0, opacity: 1, filter: "blur(0px)" }
                : { y: 16, opacity: 0, filter: "blur(6px)" }
            }
            transition={{ delay: 0.42, duration: 0.6, ease: EASE }}
            className="max-w-md text-[clamp(0.95rem,1.4vw,1.25rem)] leading-relaxed text-pretty text-muted-foreground"
          >
            {scene.detail}
          </motion.p>
        </div>

        <motion.div
          initial={false}
          animate={
            active
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: 0, scale: 0.92, y: 10 }
          }
          transition={{ delay: 0.58, ...SPRING }}
          className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card/75 px-3.5 py-2 text-xs font-medium shadow-sm backdrop-blur"
        >
          <motion.span
            className="flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground"
            animate={active ? { scale: [0.7, 1.15, 1] } : { scale: 0.7 }}
            transition={{ delay: 0.7, duration: 0.45, ease: EASE }}
          >
            <CheckIcon className="size-3" strokeWidth={3} />
          </motion.span>
          {scene.accent}
        </motion.div>
      </div>

      <motion.div
        initial={false}
        animate={
          active
            ? { opacity: 1, x: 0, y: 0, scale: 1, rotateY: 0 }
            : { opacity: 0, ...offset }
        }
        transition={{ duration: 0.95, ease: EASE }}
        className="relative min-w-0 [perspective:1800px]"
      >
        <motion.div
          className="relative aspect-[16/10] w-[78vw] max-w-[1050px] overflow-hidden rounded-[1.35rem] border border-black/10 bg-background shadow-[0_40px_120px_-34px_rgba(30,30,25,0.42)] dark:border-white/10"
          initial={false}
          animate={
            active
              ? {
                  clipPath: [
                    "inset(12% 18% 18% 12% round 1.35rem)",
                    "inset(0% 0% 0% 0% round 1.35rem)",
                  ],
                }
              : { clipPath: "inset(18% 22% 22% 18% round 1.35rem)" }
          }
          transition={{ duration: 0.85, ease: EASE }}
        >
          <div className="relative flex h-8 items-center gap-1.5 border-b bg-muted/80 px-3">
            <CircleIcon className="size-2 fill-[#ff665a] text-[#ff665a]" />
            <CircleIcon className="size-2 fill-[#ffbd44] text-[#ffbd44]" />
            <CircleIcon className="size-2 fill-[#00ca4e] text-[#00ca4e]" />
            <div className="mx-auto flex h-5 w-56 items-center justify-center overflow-hidden rounded-md bg-background/75 text-[9px] text-muted-foreground">
              <motion.span
                key={scene.view}
                initial={false}
                animate={
                  active
                    ? { y: 0, opacity: 1 }
                    : { y: 8, opacity: 0 }
                }
                transition={{ delay: 0.25, duration: 0.4 }}
              >
                mise.work / {scene.view.toLowerCase().replaceAll(" ", "-")}
              </motion.span>
            </div>
            <SparklesIcon className="size-3 text-muted-foreground/60" />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
              animate={
                active
                  ? { x: ["-120%", "220%"] }
                  : { x: "-120%" }
              }
              transition={{
                delay: 0.35,
                duration: 1.1,
                ease: EASE,
              }}
            />
          </div>

          <div className="relative h-[calc(100%-2rem)] overflow-hidden bg-background">
            <div
              className="absolute inset-0 will-change-transform"
              style={{
                transformOrigin: cam.origin,
                transform: active
                  ? `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`
                  : `translate3d(${cam.from.x}px, ${cam.from.y}px, 0) scale(${cam.from.scale}) rotate(${cam.from.rotate}deg)`,
              }}
            >
              <iframe
                src={scene.href}
                title={`${scene.view} product view`}
                tabIndex={-1}
                className="pointer-events-none absolute top-0 left-0 h-[135%] w-[135%] origin-top-left scale-[0.74] border-0"
              />
            </div>

            <AnimatePresence>
              {active && localTime > 0.55 ? (
                <motion.div
                  key={`${scene.id}-callout`}
                  className={cn(
                    "absolute z-20 inline-flex items-center gap-2 rounded-full border border-white/40 bg-[#20201e]/88 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur",
                    scene.calloutPos
                  )}
                  initial={{ opacity: 0, scale: 0.7, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ ...SPRING, delay: 0.15 }}
                >
                  <span className="relative flex size-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-75" />
                    <span className="relative size-2 rounded-full bg-brand" />
                  </span>
                  {scene.callout}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="pointer-events-none absolute inset-0 ring-1 ring-white/25 ring-inset" />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent"
              animate={
                active
                  ? { opacity: [0, 0.45, 0], x: ["-30%", "40%", "80%"] }
                  : { opacity: 0 }
              }
              transition={{ delay: 0.2, duration: 1.35, ease: EASE }}
            />
          </div>
        </motion.div>

        <motion.div
          aria-hidden
          className="absolute -right-10 -bottom-9 h-20 w-[82%] rounded-[100%] bg-black/20 blur-3xl dark:bg-black/40"
          animate={
            active
              ? { opacity: [0.3, 0.55, 0.35], scaleX: [0.88, 1.05, 0.95] }
              : { opacity: 0.2 }
          }
          transition={{ duration: 2.8, repeat: Infinity, repeatType: "mirror" }}
        />
      </motion.div>
    </motion.section>
  )
}

function Outro() {
  const letters = "Mise".split("")
  return (
    <motion.section
      className="absolute inset-0 z-10 flex items-center justify-center px-[10vw]"
      initial={{ opacity: 0, filter: "blur(12px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.85, ease: EASE }}
    >
      <div className="flex flex-col items-center gap-7 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.08, ...SPRING }}
        >
          <BrandMark className="size-[clamp(4rem,7vw,7rem)] shadow-2xl shadow-brand/30" />
        </motion.div>
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-[clamp(4rem,8vw,8rem)] leading-none font-semibold tracking-[-0.065em]">
            {letters.map((letter, index) => (
              <motion.span
                key={`${letter}-${index}`}
                className="inline-block"
                initial={{ y: 40, opacity: 0, rotateX: -50 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                transition={{ delay: 0.22 + index * 0.07, duration: 0.6, ease: EASE }}
              >
                {letter}
              </motion.span>
            ))}
          </h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6, ease: EASE }}
            className="text-[clamp(1rem,1.5vw,1.35rem)] text-muted-foreground"
          >
            Staffing, in its place.
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.55, ease: EASE }}
          className="flex items-center gap-2 text-sm font-medium"
        >
          Built for the people who keep every shift moving
          <motion.span
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <ArrowRightIcon className="size-4" />
          </motion.span>
        </motion.div>
      </div>
    </motion.section>
  )
}
