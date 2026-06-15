export const RESERVATION_STATUSES = {
  PENDING_REQUEST: 'Pending Request',
  UPCOMING: 'Upcoming',
  ONGOING: 'Ongoing',
  PAST_LOAN: 'Past-loan',
} as const

export const ARCHIVED_STATUS = 'archived'
export const ARCHIVED_NOTE_PREFIX = '[ARCHIVED]'
export const REMOVED_AT_REVIEW_NOTE_PREFIX = '[REMOVED_AT_REVIEW_UNAVAILABLE]'

export type ReservationStatus =
  (typeof RESERVATION_STATUSES)[keyof typeof RESERVATION_STATUSES]

export const RESERVATION_STATUS_VALUES = [
  RESERVATION_STATUSES.PENDING_REQUEST,
  RESERVATION_STATUSES.UPCOMING,
  RESERVATION_STATUSES.ONGOING,
  RESERVATION_STATUSES.PAST_LOAN,
] as const

export const RESERVATION_STATUS_BADGE_STYLES: Record<string, string> = {
  [RESERVATION_STATUSES.PENDING_REQUEST]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  [RESERVATION_STATUSES.UPCOMING]: 'bg-blue-100 text-blue-800 border-blue-200',
  [RESERVATION_STATUSES.ONGOING]: 'bg-green-100 text-green-800 border-green-200',
  [RESERVATION_STATUSES.PAST_LOAN]: 'bg-muted text-foreground border-border',
  [ARCHIVED_STATUS]: 'bg-purple-100 text-purple-800 border-purple-200',
}

export function normalizeLegacyReservationStatus(
  status: string | null | undefined
): ReservationStatus {
  if (!status) return RESERVATION_STATUSES.PENDING_REQUEST

  if (status === RESERVATION_STATUSES.PENDING_REQUEST) return status
  if (status === RESERVATION_STATUSES.UPCOMING) return status
  if (status === RESERVATION_STATUSES.ONGOING) return status
  if (status === RESERVATION_STATUSES.PAST_LOAN) return status

  if (status === 'pending') return RESERVATION_STATUSES.PENDING_REQUEST
  if (status === 'confirmed') return RESERVATION_STATUSES.UPCOMING
  if (status === 'active') return RESERVATION_STATUSES.ONGOING
  if (status === 'returned') return RESERVATION_STATUSES.PAST_LOAN
  if (status === 'cancelled') return RESERVATION_STATUSES.PAST_LOAN
  if (status === 'archived') return RESERVATION_STATUSES.PAST_LOAN

  return RESERVATION_STATUSES.PENDING_REQUEST
}

export function hasArchivedMarker(adminNotes: string | null | undefined) {
  return typeof adminNotes === 'string' && adminNotes.trim().startsWith(ARCHIVED_NOTE_PREFIX)
}

export function hasRemovedAtReviewMarker(adminNotes: string | null | undefined) {
  return typeof adminNotes === 'string' && adminNotes.includes(REMOVED_AT_REVIEW_NOTE_PREFIX)
}

export function isArchivedReservation(row: { status?: string | null; admin_notes?: string | null }) {
  return row.status === ARCHIVED_STATUS || hasArchivedMarker(row.admin_notes)
}
