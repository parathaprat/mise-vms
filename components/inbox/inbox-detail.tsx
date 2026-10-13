"use client"

import type * as React from "react"

import type { KindDetailProps } from "./detail-layout"
import { ChangeDetail, RequestApprovalDetail } from "./details/approvals"
import { InvoiceDetail, InvoiceDisputeDetail } from "./details/finance"
import { ComplianceDetail, StaffingDetail, SupplierCoiDetail } from "./details/ops"
import { DisputeDetail, TimesheetsDetail, TipDraftDetail, TipsDetail } from "./details/time"

export function InboxDetail(props: KindDetailProps): React.JSX.Element {
  switch (props.item.kind) {
    case "timesheets":
      return <TimesheetsDetail {...props} />
    case "dispute":
      return <DisputeDetail {...props} />
    case "tips":
      return <TipsDetail {...props} />
    case "tips-draft":
      return <TipDraftDetail {...props} />
    case "request-approval":
      return <RequestApprovalDetail {...props} />
    case "change":
      return <ChangeDetail {...props} />
    case "invoice":
      return <InvoiceDetail {...props} />
    case "invoice-dispute":
      return <InvoiceDisputeDetail {...props} />
    case "staffing":
      return <StaffingDetail {...props} />
    case "compliance":
      return <ComplianceDetail {...props} />
    case "supplier-coi":
      return <SupplierCoiDetail {...props} />
  }
}
