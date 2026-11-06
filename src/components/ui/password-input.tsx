"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  /** Text used in the accessible name of the visibility toggle. */
  toggleLabel?: string;
};

/** Password field with an accessible, touch-friendly show/hide control. */
export function PasswordInput({
  className,
  disabled,
  toggleLabel = "password",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleName = `${visible ? "Hide" : "Show"} ${toggleLabel}`;

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cn(className, "pr-14")}
      />
      <button
        type="button"
        aria-label={toggleName}
        aria-pressed={visible}
        aria-controls={props.id}
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-xl text-daet-ink/65 transition-colors hover:bg-muted hover:text-daet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <LineIcon name={visible ? "eye-off" : "eye"} className="h-5 w-5" />
      </button>
    </div>
  );
}
