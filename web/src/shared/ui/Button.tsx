import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { children: ReactNode; variant?: 'primary' | 'ghost' }
export default function Button({ children, variant = 'primary', className = '', ...props }: Props) {
  return <button className={`${styles.button} ${variant === 'primary' ? styles.primary : styles.ghost} ${className}`} {...props}>{children}</button>
}
