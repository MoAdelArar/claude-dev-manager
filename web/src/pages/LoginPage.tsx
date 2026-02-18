import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { Code2, Github, Loader2 } from 'lucide-react'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) navigate('/dashboard')
  }, [user])

  useEffect(() => {
    const code = params.get('code')
    if (!code) return
    setLoading(true)
    api.auth.callback(code)
      .then(res => { login(res.access_token, res.user); navigate('/dashboard') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [params])

  const handleLogin = async () => {
    setLoading(true)
    try {
      const { url } = await api.auth.githubUrl(`${window.location.origin}/auth/callback`)
      window.location.href = url
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-10">
          <Code2 className="w-16 h-16 text-adel-500 mx-auto mb-4" />
          <h1 className="text-4xl font-bold mb-2">AdelBot</h1>
          <p className="text-gray-400">Powered by Claude Code</p>
          <p className="text-sm text-gray-600 mt-1">Development platform for mobile and web</p>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-medium py-3.5 px-6 rounded-xl transition-colors border border-gray-700"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Github className="w-5 h-5" />}
          Sign in with GitHub
        </button>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
        )}

        <div className="mt-8 flex justify-center gap-6 text-xs text-gray-600">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-adel-500 rounded-full" /> Claude Code</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Cloud Dev</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" /> Git Push</span>
        </div>
      </div>
    </div>
  )
}
