"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      router.push("/");
    } catch {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
      router.push("/");
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00e676]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#2979ff]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass rounded-2xl p-8 relative z-10">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="text-3xl">🏏</span>
            <h1 className="text-2xl font-bold gradient-text">Crickathon</h1>
          </div>
          <p className="text-slate-400 text-sm">Sign in to your dashboard</p>
        </div>

        {/* Google Sign-In */}
        <button
          id="google-signin-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-[#2a2a3a] hover:border-[#00e676]/30 text-white rounded-xl py-3 px-4 mb-6 transition-all duration-200 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="font-medium">Continue with Google</span>
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#2a2a3a]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#111118] px-3 text-slate-500">or sign in with email</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Email address</label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0a0a0f] border border-[#2a2a3a] focus:border-[#00e676]/50 rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Password</label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0a0a0f] border border-[#2a2a3a] focus:border-[#00e676]/50 rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-[#ff1744]/10 border border-[#ff1744]/20 rounded-xl px-4 py-3">
              <p className="text-[#ff1744] text-xs">{error}</p>
            </div>
          )}

          <button
            id="email-signin-btn"
            type="submit"
            disabled={loading}
            className="w-full bg-[#00e676] hover:bg-[#00c853] text-black font-bold py-3 rounded-xl transition-all duration-200 disabled:opacity-50 glow-green"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
