const paths = {
  content: 'M4 5h16v14H4z M8 9h8 M8 13h8 M8 16h5',
  draft: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  assistant: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
  logout: 'M10 4H4v16h6 M9 12h12 M17 8l4 4-4 4',
  collapse: 'm14 6-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  server: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01',
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
