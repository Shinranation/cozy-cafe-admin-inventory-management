import { useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

export default function Signup({ onBackToLogin, onClose }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const configured = supabaseConfigured()

  async function signUpWithGoogle() {
    if (!supabase) return
    setBusy(true)
    setStatus(null)

    const redirectTo = `${window.location.origin}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    })

    if (error) {
      setStatus(error.message)
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF3E7] flex items-center justify-center p-4 font-sans text-gray-800">
      <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-[#D79A6F] max-w-lg w-full relative">
        <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-10">
          Create Account
        </h2>
        <p className="text-center text-sm text-gray-600 mb-8">
          Already have an account?{' '}
          <button type="button" onClick={onBackToLogin} className="underline hover:text-[#D79A6F]">
            Log in
          </button>
        </p>

        {!configured && (
          <p className="text-center text-red-500 mb-6 bg-red-50 p-3 rounded-xl text-sm">
            Missing Supabase env configuration.
          </p>
        )}

        <button
          type="button"
          onClick={signUpWithGoogle}
          disabled={!configured || busy}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-full border border-gray-400 font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path fill="#4285F4" d="M19.6 10.2c0-.7-.1-1.3-.2-2H10v3.8h5.4c-.2 1.2-.9 2.2-2 3v-2.5h3.2c1.9-1.8 3-4.3 3-7.3z"/>
            <path fill="#34A853" d="M10 20c2.7 0 5-1 6.7-2.7l-3.2-2.5c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H1.1v2.6C2.8 17.5 6.1 20 10 20z"/>
            <path fill="#FBBC05" d="M4.2 11.6c-.2-.6-.3-1.2-.3-1.6s.1-1 .3-1.6V5.8H1.1C.4 7.1 0 8.5 0 10s.4 2.9 1.1 4.2l3.1-2.6z"/>
            <path fill="#EA4335" d="M10 3.8c1.5 0 2.8.5 3.9 1.5l2.8-2.8C15 1 12.7 0 10 0 6.1 0 2.8 2.5 1.1 5.8l3.1 2.6c.8-2.4 3.1-4.2 5.8-4.2z"/>
          </svg>
          Continue with Google
        </button>

        {status && (
          <p className="text-center text-sm text-gray-700 mt-6 bg-gray-100 p-3 rounded-lg border border-gray-200">
            {status}
          </p>
        )}

        <div className="mt-12 text-center text-xs space-x-3 text-gray-500">
          <button type="button" onClick={onBackToLogin} className="hover:text-[#D79A6F] underline">
            Back to Login
          </button>
          <button type="button" onClick={onClose} className="hover:text-[#D79A6F] underline">
            Back to Promotions
          </button>
        </div>
      </div>
    </main>
  )
}
