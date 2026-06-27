import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './state/store.ts'

if (import.meta.env.DEV) {
  // Dev-only hook for automated verification (load boards without a file picker).
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
