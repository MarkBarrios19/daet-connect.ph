import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";

/**
 * One small line crediting the photographs on a page, each linked to its source
 * and licence.
 *
 * A photo whose source or licence is not known yet — the hero's four
 * placeholders, waiting on the Tourism Office — is still credited, in plain
 * text. It must not become an empty link: a link with no name and no URL is an
 * accessibility failure, and `[replace before launch]` is the point of it.
 */
export function PhotoCredits({ keys }: { keys: PhotoKey[] }) {
  return (
    <p className="text-sm leading-6 text-daet-ink/70">
      Photos via Wikimedia Commons:{" "}
      {keys.map((key, index) => {
        const photo = PHOTOS[key];
        return (
          <span key={key}>
            {index > 0 ? " · " : ""}
            <Credit href={photo.sourceUrl}>{photo.title}</Credit> by {photo.creator}
            {photo.licence ? (
              <>
                {" ("}
                <Credit href={photo.licenceUrl}>{photo.licence}</Credit>
                {")"}
              </>
            ) : null}
          </span>
        );
      })}
      .
    </p>
  );
}

/** A link when there is somewhere to go, plain text when there is not. */
function Credit({ href, children }: { href: string; children: string }) {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} className="underline underline-offset-2">
      {children}
    </a>
  );
}
