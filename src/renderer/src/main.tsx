import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Catch unhandled rejections at the window level too — these don't bubble
// to the React error boundary (which only catches sync render errors).
window.addEventListener('unhandledrejection', (e) => {
  void window.api?.system?.log?.('error', 'renderer', `unhandled rejection: ${String(e.reason)}`, {
    reason: String(e.reason)
  })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
