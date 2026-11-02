import Image from "next/image";
import type { ReactNode } from "react";
import { PHOTOS } from "@/lib/photo-credits";

/**
 * Sign-in, sign-up and password pages: one column on phones; on wide screens
 * the form sits beside a photo of the Bagasbas shore.
 */
export function AuthShell({ title, description, children, after }: { title: string; description: ReactNode; children: ReactNode; after?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <section className="rounded-2xl card-edge bg-surface p-5 sm:p-10">
          <h1 className="display-2 text-daet-ink">{title}</h1>
          <p className="mt-3 text-lg text-daet-ink">{description}</p>
          {children}
        </section>
        {after}
      </div>
      <figure className="relative hidden min-h-[520px] overflow-hidden rounded-2xl bg-blue-100 dark:bg-blue-900/40 lg:block">
        <Image src={PHOTOS.bagasbas.src} alt={PHOTOS.bagasbas.alt} fill sizes="40vw" className="object-cover" />
        <figcaption className="absolute bottom-3 left-3 rounded-full bg-slate-950/80 px-4 py-2 text-sm font-semibold text-white">Bagasbas Beach, Daet</figcaption>
      </figure>
    </div>
  );
}
