import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { config } from './lib/wagmi'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import { AuthProvider } from '@/contexts/AuthContext'
import App from './App'
import './styles/global.css'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
})

const rkOptions = {
  accentColor: '#273F4F',
  accentColorForeground: '#ffffff',
  borderRadius: 'small' as const,
  fontStack: 'system' as const,
}

function RainbowKitWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const rkTheme = theme === 'dark' ? darkTheme(rkOptions) : lightTheme(rkOptions)

  return (
    <RainbowKitProvider theme={rkTheme}>
      <AuthProvider>
      {children}
    </AuthProvider>
    </RainbowKitProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RainbowKitWrapper>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </RainbowKitWrapper>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
