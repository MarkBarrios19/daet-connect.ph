import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl card-edge bg-surface px-6 py-10 text-center", className)}>
      {icon ? (
        <div className="mx-auto mb-3 flex justify-center text-blue-600 dark:text-blue-300 [&_svg]:h-8 [&_svg]:w-8" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="text-lg font-bold text-daet-ink">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-daet-ink/80">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
