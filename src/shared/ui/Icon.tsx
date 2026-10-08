const paths = {
  trash: 'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  analytics: 'M4 20h16 M7 16V9 M12 16V4 M17 16v-5',
  content: 'M4 5h16v14H4z M8 9h8 M8 13h8 M8 16h5',
  draft: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  assistant: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
  logout: 'M10 4H4v16h6 M9 12h12 M17 8l4 4-4 4',
  collapse: 'm14 6-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  server: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01',
  expand: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M3 3l6 6 M21 3l-6 6 M3 21l6-6 M21 21l-6-6',
  contract: 'M3 8h5V3 M21 8h-5V3 M8 21v-5H3 M16 21v-5h5',
  close: 'm6 6 12 12 M18 6 6 18',
  chevron: 'm7 10 5 5 5-5',
} as const

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
