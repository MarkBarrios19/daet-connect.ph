import { LineIcon } from "@/components/ui/icons";

/** The Daet AI assistant's round badge, used in the inbox, the chat header and chat heads. */
export function AiAvatar({ size = "md" }: { size?: "xs" | "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : size === "xs" ? "h-7 w-7" : "h-12 w-12";
  const icon = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-5 w-5" : size === "xs" ? "h-4 w-4" : "h-6 w-6";
  return (
    <span aria-hidden="true" className={`grid ${box} shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white`}>
      <LineIcon name="chat" className={icon} />
    </span>
  );
}
