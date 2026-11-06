import type { Presence } from "@/lib/tours/messaging";

/**
 * Messenger-style status on an avatar's corner: a green dot when the person is
 * online, a small green "13m" pill when they were active recently, nothing
 * otherwise. Place inside a `relative` avatar wrapper.
 */
export function PresenceBadge({ presence, ring = "border-surface" }: { presence: Presence; ring?: string }) {
  if (presence.state === "online") {
    return <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 ${ring} bg-green-500`} />;
  }
  if (presence.state === "recent" && presence.label) {
    return (
      <span aria-hidden="true" className={`absolute -bottom-1 -right-1.5 rounded-full border-2 ${ring} bg-green-700 px-1 text-[10px] font-bold leading-4 text-white`}>
        {presence.label}
      </span>
    );
  }
  return null;
}

export function presenceText(presence: Presence): string | null {
  if (presence.state === "online") return "Active now";
  if (presence.state === "recent" && presence.label) return `Active ${presence.label} ago`;
  return null;
}
