"use client"

import type * as React from "react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { IconTile, ReplacesNote } from "../shared"
import { NUMERIC_SPECS, type NumericKey } from "./policy-config"

export function PolicySection({
  id,
  icon,
  title,
  description,
  edited,
  replaces,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  description: string
  edited: boolean
  replaces: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <Card className={cn("transition-shadow", edited && "ring-primary/40")}>
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <IconTile icon={icon} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <CardTitle>
                <h2 id={`${id}-title`}>{title}</h2>
              </CardTitle>
              <CardDescription className="text-pretty">{description}</CardDescription>
            </div>
          </div>
          {edited ? (
            <CardAction>
              <Badge variant="secondary" className="bg-primary/10 text-primary dark:bg-primary/20">
                Edited
              </Badge>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">{children}</CardContent>
        <CardFooter className="py-3">
          <ReplacesNote>{replaces}</ReplacesNote>
        </CardFooter>
      </Card>
    </section>
  )
}

/** The rule in plain English; values update live as controls change. */
export function PolicySentence({ children }: { children: React.ReactNode }) {
  return (
    <p aria-live="polite" className="rounded-r-lg border-l-2 border-primary/60 bg-muted/50 px-3.5 py-2.5 text-sm leading-relaxed text-pretty">
      {children}
    </p>
  )
}

export function V({ changed = false, children }: { changed?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "font-semibold text-foreground tabular transition-colors",
        changed && "rounded-sm bg-primary/12 px-1 text-primary dark:bg-primary/20"
      )}
    >
      {children}
    </span>
  )
}

export function ImpactNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground tabular text-pretty">{children}</p>
}

export function NumberField({
  name,
  value,
  onChange,
  error,
  disabled,
  description,
  className,
}: {
  name: NumericKey
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  description?: React.ReactNode
  className?: string
}) {
  const spec = NUMERIC_SPECS[name]
  const id = `policy-${name}`
  const invalid = !!error
  return (
    <Field data-invalid={invalid || undefined} data-disabled={disabled || undefined} className={className}>
      <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
      <InputGroup className="w-full sm:max-w-64">
        {spec.prefix ? (
          <InputGroupAddon>
            <InputGroupText>{spec.prefix}</InputGroupText>
          </InputGroupAddon>
        ) : null}
        <InputGroupInput
          id={id}
          name={name}
          inputMode={spec.decimals ? "decimal" : "numeric"}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid || description ? `${id}-help` : undefined}
          disabled={disabled}
          className="tabular"
        />
        {spec.suffix ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{spec.suffix}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {invalid ? (
        <FieldError id={`${id}-help`}>{error}</FieldError>
      ) : description ? (
        <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
      ) : null}
    </Field>
  )
}

export function ToggleField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string
  label: string
  description: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </Field>
  )
}
