/**
 * Who may be offered a booking.
 *
 * Creating a booking is restricted to tourist accounts in three places: this
 * UI gate, the `createBooking` server action and the INSERT policy on
 * `tours_bookings`. The action and the policy are the authority; this function
 * only decides whether entry points (Book buttons, assistant booking links)
 * should be shown at all.
 *
 * A visitor who is not signed in is offered them: signing in is part of the
 * flow, and the sign-in step ends with a tourist account or a redirect. An
 * account that is signed in and is not a tourist (operator, guide, admin) is
 * never offered one, and an unverifiable role fails closed.
 */
export type BookingViewer = {
  user: unknown;
  role: string | null;
  error: string | null;
};

export function canStartBooking(viewer: BookingViewer): boolean {
  if (!viewer.user) return true;
  return !viewer.error && viewer.role === "tourist";
}
