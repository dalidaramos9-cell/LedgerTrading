import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import App from './App'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
