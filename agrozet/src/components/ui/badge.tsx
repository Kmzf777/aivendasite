import React from 'react'

type BadgeProps = {
  count?: number
  children?: React.ReactNode
  className?: string
}

export default function Badge({ count, children, className }: BadgeProps) {
  const show = typeof count === 'number' ? count > 0 : !!children
  if (!show) return null
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-2 text-[11px] font-bold rounded-full ${className ?? ''}`}
      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
    >
      {typeof count === 'number' ? count : children}
    </span>
  )
}
