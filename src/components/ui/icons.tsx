import type { ComponentProps } from "react";

/**
 * Line icons (1.5px stroke on a 24px grid) that take the text colour. They
 * replace emoji, which render differently on every phone. Decorative by
 * default; pass `title` when an icon stands alone.
 */
type IconProps = Omit<ComponentProps<"svg">, "children"> & { title?: string };

function Icon({ title, className = "h-4 w-4", children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {children}
    </svg>
  );
}

export const MapPinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);

export const ShieldCheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

const p = (d: string) => <path d={d} />;

/** Icon for a role tab, chosen by its label. Unknown labels fall back to a plain dot. */
export function TabIcon({ label, className = "h-6 w-6" }: { label: string; className?: string }) {
  const shapes: Record<string, React.ReactNode> = {
    Home: p("M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"),
    Bookings: p("M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12"),
    Tours: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </>
    ),
    Plan: p("M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"),
    Messages: p("M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"),
    Packages: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </>
    ),
    Revenue: p("M7 5h7a3.5 3.5 0 0 1 0 7H7M7 9h9M7 5v14M7 12.5h4"),
    Scan: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M4 12h16" />
      </>
    ),
    Badge: p("M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 9h6M9 13h6M9 16h3"),
    Analytics: p("M5 20V10M12 20V4M19 20v-7"),
    Approvals: p("M5 12l5 5 9-10"),
    Reviews: p("M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"),
    Content: p("M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"),
  };
  const shape = shapes[label];
  return (
    <Icon className={className}>
      {shape ?? <circle cx="12" cy="12" r="3" />}
    </Icon>
  );
}

const CATEGORY_SHAPES: Record<string, string> = {
  beach: "M2 17c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M7 11a5 5 0 0 1 10 0",
  heritage: "M4 21h16M6 21V11M10 21V11M14 21V11M18 21V11M3 9l9-5 9 5z",
  nature: "M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7",
  park: "M12 21v-7M6 14a6 6 0 1 1 12 0z",
  food: "M7 3v7a2 2 0 0 0 2 0V3M8 10v11M17 3c-2.5 1.5-3 5-1 8h1v10",
  adventure: "M3 16c3 0 3-3 6-3s3 3 6 3 3-3 6-3M6 9l5-4 2 4",
  shopping: "M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0",
  religious: "M12 3v4M10 5h4M7 21V12l5-4 5 4v9M10 21v-5h4v5",
  lunch: "M7 3v7a2 2 0 0 0 2 0V3M8 10v11M17 3c-2.5 1.5-3 5-1 8h1v10",
};

/** Line icon for an attraction category (or "lunch"). */
export function CategoryIcon({ category, className = "h-5 w-5" }: { category: string; className?: string }) {
  return <Icon className={className}>{p(CATEGORY_SHAPES[category] ?? CATEGORY_SHAPES.park)}</Icon>;
}

export const ArrowDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v16M6 14l6 6 6-6" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

/** General line icons that replace emoji across the UI. */
const SHAPES = {
  "chevron-down": "M6 9l6 6 6-6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z",
  inbox: "M4 13h4l2 3h4l2-3h4M5 5h14l1 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z",
  check: "M5 12l5 5 9-10",
  cancel: "M6 6l12 12M18 6L6 18",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  return: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  guide: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  money: "M3 7h18v10H3zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 10v4M18 10v4",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  ticket: "M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12",
  message: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  award: "M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM8.5 13.5L7 21l5-3 5 3-1.5-7.5",
  note: "M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h4",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1",
  bag: "M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0",
  swap: "M4 8h13l-3-3M20 16H7l3 3",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  boat: "M3 15h18l-2 4H5zM12 4v11M12 5l6 8h-6",
  chat: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  menu: "M4 7h16M4 12h16M4 17h16",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  monitor: "M3 5h18v11H3zM8 20h8M12 16v4",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 4-6 8-6s7 2 8 6",
  building: "M5 21V5l7-3 7 3v16M3 21h18M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  phone: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  bank: "M3 9l9-5 9 5M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  idcard: "M3 5h18v14H3zM8 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 16c.5-1.5 1.5-2 3-2s2.5.5 3 2M14 10h4M14 14h4",
  chart: "M5 20V10M12 20V4M19 20v-7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  store: "M4 9l1-5h14l1 5M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5",
  plate: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  warning: "M12 4L2 20h20zM12 10v4M12 17v.01",
  tip: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
} as const;

export type IconName = keyof typeof SHAPES;

/** Any of the general icons by name, e.g. <LineIcon name="ticket" />. */
export function LineIcon({ name, className = "h-5 w-5", title }: { name: IconName; className?: string; title?: string }) {
  return (
    <Icon className={className} title={title}>
      {p(SHAPES[name])}
    </Icon>
  );
}
