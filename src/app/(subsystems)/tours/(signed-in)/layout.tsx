import type { ReactNode } from "react";
import { SignedInFrame } from "@/components/ui/signed-in-frame";

/**
 * One frame for the signed-in pages: tourist (my bookings, messages, my trips,
 * plan a trip) and operator (bookings, packages, payments). A layout is kept
 * across client navigations, so tapping between these pages does not fetch the
 * header, tab bar, notifications or chat dock again. The pages inside lay out
 * their own width with <PageBody> and stream their data behind <Suspense>.
 */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return <SignedInFrame>{children}</SignedInFrame>;
}
