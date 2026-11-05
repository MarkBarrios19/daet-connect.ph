"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { AuthActionState } from "@/lib/auth/action-state";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES } from "@/lib/profile/avatar";
import { initials } from "@/lib/profile/name";
import { compressImageFile } from "@/lib/tours/compress-image";
import { removeAvatar, saveAvatar } from "./actions";

/**
 * The account photo: choose, look at it, save, or take it away.
 *
 * The photo is shrunk in the browser before it is sent (`compressImageFile`) so
 * a phone's 8 MB picture does not travel at full size, and the server checks
 * what actually arrived anyway. The preview is the file the visitor picked, not
 * a promise about what will be stored.
 */
export function PhotoForm({
  initial,
  avatarUrl,
}: {
  initial: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [squashing, setSquashing] = useState(false);
  const [state, setState] = useState<AuthActionState | null>(null);
  const [pending, startTransition] = useTransition();

  // A preview is a URL with a lifetime; give it back when it is replaced.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const shown = preview ?? avatarUrl;

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;
    setState(null);
    setSquashing(true);
    try {
      // PNG/WebP in, a smaller JPEG out — unless the browser cannot decode it,
      // in which case the original is sent and the server decides.
      const smaller = await compressImageFile(picked);
      setFile(smaller);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(smaller));
    } catch {
      setFile(picked);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(picked));
    } finally {
      setSquashing(false);
    }
  }

  function save() {
    if (!file) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("photo", file);
      const result = await saveAvatar(data);
      setState(result);
      if (result.status === "success") {
        setFile(null);
        if (preview) URL.revokeObjectURL(preview);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeAvatar();
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  const working = pending || squashing;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-700 text-2xl font-bold text-white"
        >
          {shown ? (
            <img
              src={shown}
              alt=""
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          ) : (
            initials(initial)
          )}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="photo"
              className={
                buttonClasses({ variant: "secondary", size: "md" }) +
                (working ? " pointer-events-none opacity-60" : "")
              }
            >
              {avatarUrl || preview ? "Choose another photo" : "Choose photo"}
            </label>
            <input
              ref={inputRef}
              id="photo"
              name="photo"
              type="file"
              accept={AVATAR_ACCEPT}
              onChange={pick}
              className="sr-only"
              aria-describedby="photo-hint"
            />
            {avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                onClick={remove}
                loading={pending && !file}
                loadingText="Removing"
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p id="photo-hint" className="mt-2 text-sm text-daet-ink/75">
            JPG, PNG or WebP, up to{" "}
            {Math.round(AVATAR_MAX_BYTES / (1024 * 1024))} MB. We shrink it in
            your browser first.
          </p>
        </div>
      </div>

      {file ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={save}
            loading={pending}
            loadingText="Saving"
          >
            Save photo
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFile(null);
              if (preview) URL.revokeObjectURL(preview);
              setPreview(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {state?.message ? (
        <Notice variant={state.status === "success" ? "success" : "error"}>
          {state.message}
        </Notice>
      ) : null}
    </div>
  );
}
