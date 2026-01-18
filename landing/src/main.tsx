import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FeaturesSection } from './components/FeaturesSection.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div>
      <App />
      <FeaturesSection />
    </div>
  </StrictMode>,
)
