import { buttonClasses } from "@/components/ui/button";

/**
 * "Continue with Google".
 *
 * A plain link, not a button with a click handler: the browser has to leave for
 * Google's account chooser, and a link is what lets the Back button work and
 * lets the action be opened in a new tab. The colours of the G are Google's own
 * brand mark and are deliberately not themed.
 */
export function GoogleMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.07H2.18a11 11 0 0 0 0 9.87l3.66-2.85Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function GoogleSignIn({ nextUrl = "/" }: { nextUrl?: string }) {
  const href = nextUrl && nextUrl !== "/" ? `/auth/oauth?next=${encodeURIComponent(nextUrl)}` : "/auth/oauth";
  return (
    <a href={href} className={buttonClasses({ variant: "ghost", size: "lg", fullWidth: true })} rel="nofollow">
      <GoogleMark />
      Continue with Google
    </a>
  );
}

/** The "or use your email" rule between the Google button and the form. */
export function OrDivider() {
  return (
    <p className="flex items-center gap-3 text-sm font-semibold text-daet-ink/75">
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      or use your email
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </p>
  );
}
