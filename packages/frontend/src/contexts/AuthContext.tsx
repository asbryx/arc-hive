import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface AuthState {
  token: string | null
  wallet: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  signOut: () => void
}

const AuthContext = createContext<AuthState>({
  token: null,
  wallet: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  signOut: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem('arc-hive-auth')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.token && data.wallet && data.expiresAt) {
          const expires = new Date(data.expiresAt)
          if (expires > new Date()) {
            setToken(data.token)
          } else {
            localStorage.removeItem('arc-hive-auth')
          }
        }
      } catch {
        localStorage.removeItem('arc-hive-auth')
      }
    }
  }, [])

  // Auto-sign when wallet connects (if no valid token)
  useEffect(() => {
    if (!isConnected || !address) {
      setToken(null)
      return
    }

    // Check if we have a valid token for this wallet
    const stored = localStorage.getItem('arc-hive-auth')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.token && data.wallet?.toLowerCase() === address.toLowerCase()) {
          const expires = new Date(data.expiresAt)
          if (expires > new Date()) {
            setToken(data.token)
            return
          }
        }
      } catch {}
    }

    // No valid token — prompt signature
    handleSignIn()
  }, [isConnected, address])

  const handleSignIn = useCallback(async () => {
    if (!address) return
    setIsLoading(true)
    setError(null)

    try {
      // Step 1: Get nonce
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${encodeURIComponent(address)}`)
      if (!nonceRes.ok) throw new Error('Failed to get nonce')
      const { message } = await nonceRes.json()

      // Step 2: Sign message
      const signature = await signMessageAsync({ message })

      // Step 3: Verify and get token
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, signature }),
      })
      if (!verifyRes.ok) {
        const err = await verifyRes.json()
        throw new Error(err.error || 'Signature verification failed')
      }
      const result = await verifyRes.json()

      // Step 4: Store token
      setToken(result.token)
      localStorage.setItem('arc-hive-auth', JSON.stringify({
        token: result.token,
        wallet: result.wallet,
        expiresAt: result.expiresAt,
      }))
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
      console.error('[auth] Sign-in error:', err.message)
    }

    setIsLoading(false)
  }, [address, signMessageAsync])

  const signOut = useCallback(() => {
    setToken(null)
    localStorage.removeItem('arc-hive-auth')
  }, [])

  return (
    <AuthContext.Provider value={{
      token,
      wallet: address?.toLowerCase() || null,
      isAuthenticated: !!token,
      isLoading,
      error,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// Helper: add auth header to fetch options
export function authHeaders(token: string | null, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}
