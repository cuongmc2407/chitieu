/**
 * Hand-rolled inline SVG icons — a tab bar of emoji reads as a prototype,
 * and a whole icon package would be far more weight than the dozen glyphs
 * this app actually uses.
 */
interface IconProps {
  className?: string;
}

function Svg({ className = "h-6 w-6", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16.8 3.6a2.3 2.3 0 0 1 3.3 3.2L8.2 18.8 3.7 20.3l1.5-4.5Z" />
      <path d="M14.8 5.6 18 8.8" />
    </Svg>
  );
}

export function IconReceipt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2.8h12v18.4l-3-1.8-3 1.8-3-1.8-3 1.8Z" />
      <path d="M9.2 8h5.6M9.2 12h5.6M9.2 16h3.4" />
    </Svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M7 20.5v-5.2M12 20.5V6.4M17 20.5v-8.6" />
    </Svg>
  );
}

export function IconRepeat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m16.5 2.8 3.7 3.7-3.7 3.7" />
      <path d="M20.2 6.5H9a4.2 4.2 0 0 0-4.2 4.2v1" />
      <path d="m7.5 21.2-3.7-3.7 3.7-3.7" />
      <path d="M3.8 17.5H15a4.2 4.2 0 0 0 4.2-4.2v-1" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h6M14 7h6M4 17h3M11 17h9" />
      <circle cx="12" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </Svg>
  );
}

export function IconTag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 13.3 12.2 5H4.5v7.7l8.3 8.3a1.8 1.8 0 0 0 2.5 0l5.2-5.2a1.8 1.8 0 0 0 0-2.5Z" />
      <path d="M8 8.5h.01" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16M9.5 6.5V4h5v2.5M10 11v6M14 11v6" />
      <path d="m5.8 6.5 1 13.2h10.4l1-13.2" />
    </Svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h12a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M3.5 9.5h17M16.5 13.5h.01" />
    </Svg>
  );
}

export function IconCloud(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 18.5a3.8 3.8 0 0 1-.4-7.6 5.2 5.2 0 0 1 10 1.1 3.3 3.3 0 0 1-.6 6.5Z" />
    </Svg>
  );
}
