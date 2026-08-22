import type { SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export function IconNotes(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L20 8.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15Z" />
      <path d="M14 3v4.5A1.5 1.5 0 0 0 15.5 9H20" />
      <path d="M8 12.5h8M8 16h5" />
    </Icon>
  );
}

export function IconArchive(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1.2" />
      <path d="M5 8.5v9.5A1.5 1.5 0 0 0 6.5 19.5h11A1.5 1.5 0 0 0 19 18V8.5" />
      <path d="M10 13h4" />
    </Icon>
  );
}

export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15" />
      <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
      <path d="M6.5 7 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10.3 11v6M13.7 11v6" />
    </Icon>
  );
}

export function IconTag(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12.5 4H6.5A2.5 2.5 0 0 0 4 6.5v6l9.5 9.5a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L12.5 4Z" />
      <circle cx="8.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconPin(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14.5 3.5 20 9l-2 2-1-1-3.5 3.5L14 18l-2 2-3-3-4 4-1-1 4-4-3-3 2-2 4.5-.5L14.5 7l-1-1 2-2Z" />
    </Icon>
  );
}

export function IconPinFilled(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon fill="currentColor" {...props}>
      <path d="M14.5 3.5 20 9l-2 2-1-1-3.5 3.5L14 18l-2 2-3-3-4 4-1-1 4-4-3-3 2-2 4.5-.5L14.5 7l-1-1 2-2Z" />
    </Icon>
  );
}

export function IconPalette(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.7-.8 1.7-1.7 0-.45-.18-.85-.45-1.15-.28-.32-.45-.72-.45-1.15 0-.9.75-1.65 1.7-1.65H16a4 4 0 0 0 4-4c0-4.4-3.6-7.35-8-7.35Z" />
      <circle cx="8" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </Icon>
  );
}

export function IconChecklist(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 6.5 6 8l3-3" />
      <path d="M11 6h9" />
      <path d="M4.5 12.5 6 14l3-3" />
      <path d="M11 12h9" />
      <path d="M4.5 18.5 6 20l3-3" />
      <path d="M11 18h9" />
    </Icon>
  );
}

export function IconBold(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 4h6a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 11h7a3.5 3.5 0 0 1 0 7H7z" />
    </Icon>
  );
}

export function IconItalic(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M11 4h6M7 20h6M14 4l-4 16" />
    </Icon>
  );
}

export function IconBulletList(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10" />
    </Icon>
  );
}

export function IconDragHandle(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconImage(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M4 17l5.2-5.2a1.5 1.5 0 0 1 2.1 0L15 15.5M14.5 14l1.4-1.4a1.5 1.5 0 0 1 2.1 0L20.5 15" />
    </Icon>
  );
}

export function IconVideo(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="6" width="12.5" height="12" rx="2" />
      <path d="M16 10.5 20 8v8l-4-2.5" />
    </Icon>
  );
}

export function IconMic(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="9.5" y="3.5" width="5" height="10" rx="2.5" />
      <path d="M6 11.5a6 6 0 0 0 12 0" />
      <path d="M12 17.5v3M9 20.5h6" />
    </Icon>
  );
}

export function IconStop(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon fill="currentColor" {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </Icon>
  );
}
