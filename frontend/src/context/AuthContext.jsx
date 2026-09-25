import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getMe } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const res = await getMe({ skipAuthError: true, skipGlobalError: true })
    setUser(res.data)
    return res.data
  }, [])

  useEffect(() => {
    refreshUser()
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [refreshUser])

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
