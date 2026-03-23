"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn("password", { email, password, flow: "signIn" });
    } catch {
      setError("Feil e-post eller passord");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Logg inn</h1>
        <p className="text-sm text-[#AAAAAA] mb-6">
          FinansAnalyse — kun for BI-studenter
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm mb-1.5 text-[#AAAAAA]">
              E-post
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="s1234567@bi.no"
              required
              className="w-full px-3 py-2 bg-elevated border border-white/10 rounded-lg text-sm placeholder:text-[#555]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm mb-1.5 text-[#AAAAAA]">
              Passord
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="w-full px-3 py-2 bg-elevated border border-white/10 rounded-lg text-sm placeholder:text-[#555]"
            />
          </div>

          {error && (
            <p className="text-negative text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent text-[#1A1A1E] rounded-lg text-sm font-medium hover:brightness-90 transition-all duration-150 disabled:opacity-50"
          >
            {loading ? "Logger inn..." : "Logg inn"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#AAAAAA]">
          Har du ikke konto?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Registrer deg
          </Link>
        </p>
      </div>
    </main>
  );
}
