import type { BoardFilter, BoardStatus, PaymentNote } from "@/lib/tours/booking-board";
import type { BusyReason } from "@/lib/tours/guide-swap";
import type { ReviewableProof } from "@/app/(subsystems)/tours/operator/bookings/proof-review";

/**
 * The rows the bookings board draws. Everything here crosses from the server
 * page to the board's client components, so it is plain data: no functions, no
 * class instances, and amounts already rounded.
 */

export type BoardGuide = {
  id: string;
  full_name: string;
  contact_phone: string | null;
  specialties: string[] | null;
};

export type BoardSwap = {
  id: string;
  fromGuideId: string;
  fromGuideName: string;
  toGuideId: string | null;
  toGuideName: string | null;
  reason: string;
  createdAt: string;
};

export type BoardCancellation = {
  id: string;
  reason: string;
  requestedAt: string;
  late: boolean;
};

export type BoardPickerGuide = {
  id: string;
  full_name: string;
  contact_phone: string | null;
  specialties: string[] | null;
  /** Why this guide can't take the tour date (null = free). */
  reason: BusyReason | null;
};

export type BoardRow = {
  id: string;
  reference: string;
  /** The lifecycle's own status (booking-lifecycle.ts). */
  lifecycleStatus: string;
  status: BoardStatus;
  packageId: string;
  packageTitle: string;
  coverImageUrl: string | null;
  tourDate: string;
  pax: number;
  totalAmount: number;
  totalPaid: number;
  paymentStatus: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  specialRequests: string | null;
  guideId: string | null;
  guideName: string | null;
  note: PaymentNote;
  pendingProofs: ReviewableProof[];
  refundable: number;
  capacity: { capacity_total: number; capacity_booked: number } | null;
  /** Guide id → marked available (true) / unavailable (false) on the tour date. */
  availability: Record<string, boolean>;
  /** Guide id → why they can't take the date (null = free). */
  busy: Record<string, BusyReason | null>;
  /** Approved guides for the assign picker, with what the database says about each on this date. */
  picker: BoardPickerGuide[];
  swap: BoardSwap | null;
  cancellation: BoardCancellation | null;
  canCallOff: boolean;
  /** PayMongo is configured on this deployment, and whether it is in live mode. */
  paymongoConfigured: boolean;
  paymongoLive: boolean;
  calledOff: "awaiting" | "rescheduled" | null;
  calledOffReason: string | null;
  rescheduledFrom: string | null;
  cancellationReason: string | null;
};

export type BoardFilters = {
  status: BoardFilter;
  q: string;
  packageId: string;
  date: string;
  page: number;
};

export type BoardPageInfo = {
  page: number;
  pageCount: number;
  first: number;
  total: number;
  pageSize: number;
};

export type { BoardFilter, BoardStatus, PaymentNote };
