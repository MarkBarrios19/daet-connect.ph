import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Form controls. Text is 16px (text-base) so iOS does not zoom on focus, and
 * controls are at least 44px tall. Pass `invalid` to show the error state;
 * `Field` wires the label, hint and error message to the control by id.
 */
export const controlClasses =
  "mt-1 block min-h-12 w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-base text-daet-ink placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-muted aria-[invalid=true]:border-red-600";

export function fieldDescribedBy(id: string, { hint, error }: { hint?: ReactNode; error?: ReactNode }) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // A single control child gets its id, description and invalid state from the
  // Field, so callers cannot forget to connect the hint or the error message.
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as Record<string, unknown>).id ?? id,
        "aria-describedby":
          (children.props as Record<string, unknown>)["aria-describedby"] ?? fieldDescribedBy(id, { hint, error }),
        "aria-invalid": (children.props as Record<string, unknown>)["aria-invalid"] ?? (error ? true : undefined),
      })
    : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-bold text-daet-ink">
        {label}
        {required ? (
          <span className="text-red-600 dark:text-red-300" aria-hidden="true">
            {" "}*
          </span>
        ) : null}
      </label>
      {control}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-daet-ink/75">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type ControlProps = { invalid?: boolean };

export function Input({ invalid, className, ...props }: ComponentProps<"input"> & ControlProps) {
  return <input aria-invalid={invalid || undefined} className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({ invalid, className, ...props }: ComponentProps<"textarea"> & ControlProps) {
  return <textarea aria-invalid={invalid || undefined} className={cn(controlClasses, className)} {...props} />;
}

export function Select({ invalid, className, ...props }: ComponentProps<"select"> & ControlProps) {
  return <select aria-invalid={invalid || undefined} className={cn(controlClasses, className)} {...props} />;
}
