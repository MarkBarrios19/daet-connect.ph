import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Cards use rounded-2xl per the team UI standard. They sit white on a white
 * ground with no resting shadow, and carry the `card-edge` hairline so the edge
 * — not a tone step — separates them (owner's note on image-46).
 * `min-w-0` lets a card shrink below its content when it sits in a grid or
 * flex row, so one long single-line label can't stretch the whole row past
 * the edge of the screen (owner's note on the analytics bar list).
 */
export function Card({ className, padded = true, ...props }: ComponentProps<"div"> & { padded?: boolean }) {
  return <div className={cn("min-w-0 rounded-2xl card-edge bg-surface", padded && "p-5 sm:p-6", className)} {...props} />;
}

/** A card's heading, with an optional one-line description under it and an action on the right. */
export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-daet-ink sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-daet-ink/80">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
