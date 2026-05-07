import { useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

export default function Login({ onClose, onAdminAccess, adminSignedIn, signedInEmail }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const configured = supabaseConfigured()

  async function signInWithGoogle() {
    if (!supabase) return
    setBusy(true)
    setStatus(null)

    const redirectTo = `${window.location.origin}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })

    if (error) {
      setStatus(error.message)
      setBusy(false)
    }
  }

  async function signInWithEmail() {
    if (!supabase) return
    setBusy(true)
    setStatus(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    setStatus(error ? error.message : 'Sign-in success.')
    if (!error && onAdminAccess) onAdminAccess()
  }

  async function signUpWithEmail() {
    if (!supabase) return
    setBusy(true)
    setStatus(null)
    const { error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    setStatus(error ? error.message : 'Sign-up success. Check your email for verification.')
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px', background: '#fff' }}>
      <h2>Admin Login</h2>
      <p>Promotions stays public. Admin tools appear only after admin login.</p>

      {!configured && <p>Missing Supabase env configuration.</p>}

      {signedInEmail && (
        <p>
          Signed in as: {signedInEmail}
          {adminSignedIn ? ' (admin access granted)' : ' (signed in but not an admin)'}
        </p>
      )}

      {signedInEmail && !adminSignedIn && (
        <p>
          Access denied for Admin Inventory. Ask an existing admin to add your user ID to
          <code> public.user_roles </code>with role
          <code> admin</code>.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={!configured || busy}
        >
          Sign in with Google
        </button>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: 'block', marginTop: 8, marginBottom: 8, width: '100%' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: 'block', marginBottom: 8, width: '100%' }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={signInWithEmail}
            disabled={!configured || busy || !email || !password}
          >
            Sign-in
          </button>
          <button
            type="button"
            onClick={signUpWithEmail}
            disabled={!configured || busy || !email || !password}
          >
            Sign-up
          </button>
        </div>

        {status && <p>{status}</p>}
      </div>

      <button type="button" onClick={onClose} style={{ marginTop: 12 }}>
        Back to Promotions
      </button>
      {!adminSignedIn && (
        <button type="button" onClick={onAdminAccess} style={{ marginTop: 12, marginLeft: 8 }}>
          Continue to Promotions
        </button>
      )}
    </main>
  )
}
