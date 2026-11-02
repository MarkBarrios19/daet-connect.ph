"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";

interface PackageFiltersProps {
  currentParams: {
    location?: string;
    minPrice?: string;
    maxPrice?: string;
    duration?: string;
    sort?: string;
  };
}

/** The places most trips go to, as one-tap filters. */
const PLACES = ["Calaguas", "Mercedes", "Bagasbas", "Daet", "Vinzons"];

const chip = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${
    on ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"
  }`;

/**
 * Mobile first: places as one-tap chips, and the rest (price, sort, any
 * place name) in a "More filters" panel that opens in place.
 */
export function PackageFilters({ currentParams }: PackageFiltersProps) {
  const router = useRouter();
  const [location, setLocation] = useState(currentParams.location || "");
  const [minPrice, setMinPrice] = useState(currentParams.minPrice || "");
  const [maxPrice, setMaxPrice] = useState(currentParams.maxPrice || "");
  const [sort, setSort] = useState(currentParams.sort || "created_at");
  const extra = [currentParams.minPrice, currentParams.maxPrice, currentParams.sort && currentParams.sort !== "created_at" ? currentParams.sort : ""].filter(Boolean).length;

  const hrefFor = (place: string | null) => {
    const params = new URLSearchParams();
    if (place) params.set("location", place);
    if (currentParams.minPrice) params.set("minPrice", currentParams.minPrice);
    if (currentParams.maxPrice) params.set("maxPrice", currentParams.maxPrice);
    if (currentParams.sort) params.set("sort", currentParams.sort);
    return `/tours/browse${params.toString() ? `?${params}` : ""}`;
  };

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (location) params.set("location", location);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (sort && sort !== "created_at") params.set("sort", sort);
    router.push(`/tours/browse${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const clearFilters = () => {
    setLocation("");
    setMinPrice("");
    setMaxPrice("");
    setSort("created_at");
    router.push("/tours/browse");
  };

  const current = (currentParams.location ?? "").toLowerCase();

  return (
    <div>
      <nav aria-label="Places" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={hrefFor(null)} aria-current={!current ? "page" : undefined} className={chip(!current)}>
          Everywhere
        </Link>
        {PLACES.map((place) => (
          <Link key={place} href={hrefFor(place)} aria-current={current === place.toLowerCase() ? "page" : undefined} className={chip(current === place.toLowerCase())}>
            {place}
          </Link>
        ))}
      </nav>

      <details className="group mt-3" open={extra > 0 || undefined}>
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full px-1 font-bold text-blue-700 dark:text-blue-300 hover:underline [&::-webkit-details-marker]:hidden">
          <LineIcon name="settings" className="h-5 w-5" />
          More filters{extra ? ` (${extra})` : ""}
        </summary>
        <form
          className="mt-2 grid gap-4 rounded-2xl card-edge bg-surface p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-[2fr_1fr_1fr_1.4fr_auto] lg:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <Field id="filter-location" label="Place">
            <Input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bagasbas" />
          </Field>
          <Field id="filter-min-price" label="Min price (₱)">
            <Input type="number" inputMode="numeric" min={0} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
          </Field>
          <Field id="filter-max-price" label="Max price (₱)">
            <Input type="number" inputMode="numeric" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="No limit" />
          </Field>
          <Field id="filter-sort" label="Sort by">
            <Select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="created_at">Newest first</option>
              <option value="price">Price: low to high</option>
              <option value="title">Name: A to Z</option>
            </Select>
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit">Apply</Button>
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}
