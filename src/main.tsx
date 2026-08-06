import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@ui/App'
// Tokens first: every rule in styles.css resolves against them (ADR-021).
import '@ui/tokens.css'
import '@ui/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
