import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './IconButton.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { children: ReactNode; label: string }
export default function IconButton({ children, label, ...props }: Props) {
  return <button className={styles.button} aria-label={label} title={label} {...props}>{children}</button>
}
