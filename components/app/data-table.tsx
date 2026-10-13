"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type { ColumnDef, RowSelectionState, SortingState } from "@tanstack/react-table"

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  enableSelection?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  canSelectRow?: (row: T) => boolean
  initialSorting?: SortingState
  pageSize?: number
  empty?: React.ReactNode
  className?: string
  rowClassName?: (row: T) => string | undefined
  dense?: boolean
}

export function SortHeader<T>({ column, title, className }: { column: Column<T, unknown>; title: string; className?: string }) {
  const sorted = column.getIsSorted()
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        sorted && "text-foreground",
        className
      )}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3" />
      ) : (
        <ArrowUpDownIcon className="size-3 opacity-40" />
      )}
    </button>
  )
}

function isInteractive(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest("button, a, input, textarea, select, label, [role=checkbox], [role=menuitem], [data-no-row-click]")
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  onRowClick,
  enableSelection = false,
  rowSelection,
  onRowSelectionChange,
  canSelectRow,
  initialSorting = [],
  pageSize,
  empty,
  className,
  rowClassName,
  dense = false,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [internalSelection, setInternalSelection] = React.useState<RowSelectionState>({})
  const selection = rowSelection ?? internalSelection
  const setSelection = onRowSelectionChange ?? setInternalSelection

  const allColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!enableSelection) return columns
    const select: ColumnDef<T, unknown> = {
      id: "__select",
      size: 36,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all rows"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
        />
      ),
    }
    return [select, ...columns]
  }, [columns, enableSelection])

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    enableRowSelection: canSelectRow ? (row: Row<T>) => canSelectRow(row.original) : enableSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pageSize ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize, pageIndex: 0 } } } : {}),
    autoResetPageIndex: false,
  })

  const rows = table.getRowModel().rows
  const pageCount = pageSize ? table.getPageCount() : 1

  React.useEffect(() => {
    if (!pageSize) return
    const { pageIndex } = table.getState().pagination
    if (pageIndex > 0 && pageIndex >= pageCount) table.setPageIndex(Math.max(0, pageCount - 1))
  }, [pageCount, pageSize, table])

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={header.column.columnDef.size && header.column.id === "__select" ? { width: header.column.columnDef.size } : undefined}
                    className={cn("h-9 text-xs font-medium text-muted-foreground", header.column.id === "__select" && "w-9 pr-0")}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={allColumns.length} className="p-0">
                  {empty ?? <div className="py-12 text-center text-sm text-muted-foreground">Nothing to show yet.</div>}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={(e) => {
                    if (!onRowClick || isInteractive(e.target)) return
                    onRowClick(row.original)
                  }}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(dense ? "py-1.5" : "py-2.5", cell.column.id === "__select" && "w-9 pr-0")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {pageSize && pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2 px-1 pt-3 text-xs text-muted-foreground">
          <span className="tabular">
            Page {table.getState().pagination.pageIndex + 1} of {pageCount} · {table.getPrePaginationRowModel().rows.length} rows
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
