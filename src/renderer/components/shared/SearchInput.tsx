import { InputHTMLAttributes, forwardRef } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onAnimationStart'> {}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (props, ref) => {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">⌕</span>
        <motion.input
          ref={ref}
          whileFocus={{ scale: 1.01 }}
          transition={{ duration: 0.15 }}
          type="text"
          className="w-full rounded-lg border border-border bg-surface pl-10 pr-4 py-2 text-sm text-ink
            placeholder:text-muted transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            hover:border-ink/30"
          placeholder="Buscar..."
          {...(props as HTMLMotionProps<'input'>)}
        />
      </div>
    )
  }
)
SearchInput.displayName = 'SearchInput'
