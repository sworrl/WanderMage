import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
import './styles/global.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* MemoryRouter: app routes live in memory — no paths ever appear in the address bar. */}
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
