export function getCopyrightNotice(): string {
  const year = new Date().getFullYear();
  const base = 2023; // first public release year
  const range = year === base ? `${year}` : `${base}–${year}`;
  return `© ${range} Ryan Moore. All rights reserved.`;
}

