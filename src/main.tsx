import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { LocaleProvider } from './lib/i18n.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
)
