import type { CSSProperties } from "react";

// Inlined so the wordmark text follows the theme (a static <img> can't be
// recolored, leaving the near-black lettering invisible in dark mode). The
// brand mark keeps its fixed colors; only the text tracks --text-strong.
export function Wordmark({
  title,
  className = "pd-onb__wordmark",
  style,
}: {
  title: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-label={title}
      className={className}
      role="img"
      style={style}
      viewBox="0 0 360 100"
    >
      <rect x="6" y="14" width="72" height="72" rx="22" fill="#F95E9E" />
      <ellipse cx="42" cy="60" rx="14" ry="11.5" fill="#fff" />
      <ellipse cx="26" cy="49" rx="5.6" ry="7.2" fill="#fff" />
      <ellipse cx="36" cy="41" rx="5.6" ry="7.6" fill="#fff" />
      <ellipse cx="48" cy="41" rx="5.6" ry="7.6" fill="#fff" />
      <ellipse cx="58" cy="49" rx="5.6" ry="7.2" fill="#fff" />
      <path
        d="M42 63 C40 59.5 35 60.5 35 64 C35 67 42 70 42 70 C42 70 49 67 49 64 C49 60.5 44 59.5 42 63 Z"
        fill="#16B8A6"
      />
      <text
        x="96"
        y="65"
        fontFamily="Fredoka, Trebuchet MS, sans-serif"
        fontSize="42"
        fontWeight="600"
        fill="var(--text-strong)"
      >
        Pets<tspan fill="#F95E9E">-</tspan>Driven
      </text>
    </svg>
  );
}
