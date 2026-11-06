"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadChats } from "@/components/chat/unread-badge";
import { LogoutButton } from "@/components/ui/logout-button";
import { DarkModeSwitch } from "@/components/ui/theme-toggle";
import { useDragDismiss } from "@/components/ui/use-drag-dismiss";
import { usePopover } from "@/components/ui/use-popover";

export type AccountLink = { href: string; label: string };

const MESSAGES_HREF = "/tours/messages";

function unreadLabel(count: number) {
  return count ? `, ${count} unread ${count === 1 ? "chat" : "chats"}` : "";
}

/**
 * The round face beside the account: the person's photo when they have one, the
 * first letter of their name when they do not (owner's note: keep it round).
 *
 * A plain <img>, not next/image: this is on every page, the photo is a few
 * kilobytes, and nothing should stand between a visitor and it. The image is
 * decorative — the button already carries the name — so `alt=""` and the letter
 * stays underneath, which is also what shows if the photo fails to load.
 */
function Avatar({
  initial,
  unread,
  small = false,
  ring = false,
  src,
}: {
  initial: string;
  unread: number;
  small?: boolean;
  ring?: boolean;
  src?: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className={`relative grid place-items-center rounded-full bg-blue-700 font-bold text-white ${small ? "h-[1.625rem] w-[1.625rem] text-[13px]" : "h-10 w-10 text-base"} ${ring ? "ring-2 ring-blue-600 ring-offset-2 ring-offset-surface" : ""}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={small ? 26 : 40}
          height={small ? 26 : 40}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        initial
      )}
      {unread ? (
        <span
          className={`absolute rounded-full border-2 border-surface bg-yellow-500 ${small ? "-right-1 -top-[3px] h-2.5 w-2.5" : "-right-0.5 -top-0.5 h-3 w-3"}`}
        />
      ) : null}
    </span>
  );
}

/**
 * The account control (nav iteration 3): a round avatar with a yellow dot for
 * unread chats. It opens a short menu with the user's own pages, Dark mode and
 * Sign out. `tab` is the phone version, the last tab of the bottom bar.
 */
export function AccountMenu({
  initial,
  name,
  links,
  variant = "header",
  avatarUrl = null,
}: {
  initial: string;
  name: string;
  links: AccountLink[];
  variant?: "header" | "tab";
  /** The account photo, when there is one; the initial is the fallback. */
  avatarUrl?: string | null;
}) {
  const { open, setOpen, toggle, rootRef, buttonRef } = usePopover(
    `account-${variant}`,
  );
  const unread = useUnreadChats();
  const pathname = usePathname() ?? "";
  const tab = variant === "tab";
  // On phones the sheet can be swiped down to close.
  const { sheetRef } = useDragDismiss<HTMLDivElement>(
    "down",
    () => setOpen(false),
    open && tab,
  );

  return (
    <div ref={rootRef} className={tab ? "contents" : "relative"}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={`account-panel-${variant}`}
        // The tab's name comes from its visible label ("You, your account, …").
        aria-label={tab ? undefined : `Your account${unreadLabel(unread)}`}
        title={name}
        onClick={toggle}
        className={
          tab
            ? `flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-bold transition-[color,scale] duration-150 ease-out active:scale-95 ${open ? "text-blue-600 dark:text-blue-300" : "text-daet-ink/75 hover:text-daet-ink"}`
            : "grid h-12 w-12 place-items-center rounded-full transition-[background-color,scale] duration-150 ease-out hover:bg-muted active:scale-95"
        }
      >
        <Avatar
          initial={initial}
          unread={unread}
          small={tab}
          ring={tab && open}
          src={avatarUrl}
        />
        {tab ? (
          <>
            <span aria-hidden="true">You</span>
            <span className="sr-only">
              You, your account{unreadLabel(unread)}
            </span>
          </>
        ) : null}
      </button>
      {open ? (
        <div
          ref={tab ? sheetRef : undefined}
          id={`account-panel-${variant}`}
          className={
            tab
              ? "motion-rise fixed inset-x-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md touch-none"
              : // Grows from the avatar.
                "motion-pop absolute right-0 top-full z-50 mt-3 w-[18.75rem] [--pop-origin:calc(100%-1.5rem)_0]"
          }
        >
          {tab ? null : (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 right-4 h-4 w-4 rotate-45 rounded-[3px] bg-surface"
            />
          )}
          <nav
            aria-label="Your account"
            className="relative rounded-2xl card-edge bg-surface p-2 shadow-[var(--shadow-float)]"
          >
            {tab ? (
              <span
                aria-hidden="true"
                className="mx-auto mt-1 block h-1.5 w-10 rounded-full bg-muted-strong"
              />
            ) : null}
            <p className="truncate px-4 pb-1 pt-2 text-sm text-daet-ink/70">
              {name}
            </p>
            <ul>
              {links.map((link) => {
                const current =
                  pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 text-base ${current ? "bg-blue-50 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-daet-ink hover:bg-muted"}`}
                    >
                      {link.label}
                      {link.href === MESSAGES_HREF && unread ? (
                        <span className="inline-grid min-w-[1.375rem] place-items-center rounded-full bg-blue-700 px-1.5 text-xs font-bold leading-[1.375rem] text-white">
                          {unread > 9 ? "9+" : unread}
                          <span className="sr-only">
                            {" "}
                            unread {unread === 1 ? "chat" : "chats"}
                          </span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
              <li>
                <DarkModeSwitch />
              </li>
              <li>
                <LogoutButton menu />
              </li>
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
