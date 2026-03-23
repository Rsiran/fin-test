"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateForm(): string | null {
    if (!email.endsWith("@bi.no")) {
      return "Kun @bi.no e-postadresser er tillatt";
    }
    if (password.length < 8) {
      return "Passordet må være minst 8 tegn";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      await signIn("password", { email, password, flow: "signUp" });
    } catch {
      setError("Kunne ikke opprette konto. Prøv igjen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Registrer deg</h1>
        <p className="text-sm text-[#AAAAAA] mb-6">
          Bruk din BI-studentmail for å opprette konto
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
            <p className="mt-1 text-xs text-[#555]">Må være en @bi.no-adresse</p>
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
              placeholder="Minst 8 tegn"
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
            {loading ? "Oppretter konto..." : "Opprett konto"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#AAAAAA]">
          Har du allerede konto?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Logg inn
          </Link>
        </p>
      </div>
    </main>
  );
}
