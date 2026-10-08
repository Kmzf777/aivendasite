import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Converte texto (mesmo em CAPS LOCK) para Title Case, respeitando nomes
// compostos. Ex.: "LORRANE" -> "Lorrane", "maria clara" -> "Maria Clara".
export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Extrai apenas o primeiro nome e aplica Title Case.
// Ex.: "DOUGLAS RODRIGO DE LIMA" -> "Douglas".
export function getFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? ''
  return toTitleCase(first)
}
