import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    ApexCharts?: any
    __safeApexWrapped?: boolean
  }
}

if (typeof window !== 'undefined' && window.ApexCharts && !window.__safeApexWrapped) {
  const OriginalApexCharts = window.ApexCharts

  function SafeApexCharts(this: any, el: Element | null, options: any) {
    if (!(this instanceof SafeApexCharts)) {
      return new (SafeApexCharts as any)(el, options)
    }

    if (!el || !(el instanceof Element)) {
      return {
        render: () => Promise.resolve(),
        destroy: () => {},
        updateOptions: () => {},
        updateSeries: () => {},
      }
    }

    return new OriginalApexCharts(el, options)
  }

  SafeApexCharts.prototype = OriginalApexCharts.prototype
  window.ApexCharts = SafeApexCharts as any
  window.__safeApexWrapped = true
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
