"use client";
// src/app/login/page.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email) { setError("Please enter your email address."); return; }
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    if (!password) { setError("Please enter your password."); return; }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ffffff",
      fontFamily: "system-ui, -apple-system, sans-serif",
      color: "#111827"
    }}>
      
      {/* ── Logo & Subtitle ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "32px" }}>
        {/* Ensure QFT-image.png is inside the public/ directory */}
        <img 
          src="/QFT-image.png" 
          alt="Quinte Financial Technologies" 
          style={{ height: "100px", marginBottom: "24px", objectFit: "contain" }} 
        />
        <h2 style={{ color: "#64748b", fontSize: "1.1rem", margin: 0, fontWeight: 400 }}>
          Sign in to your account
        </h2>
      </div>

      {/* ── Main Login Card ── */}
      <div style={{
        width: "100%",
        maxWidth: "440px",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "32px",
        boxSizing: "border-box",
        boxShadow: "0 4px 20px rgba(0,0,0,0.03)"
      }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }} autoComplete="off">

          {/* Email Field */}
          <div>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#0B2463" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="analyst@yourcompany.com"
              autoComplete="new-password"
              style={{
                width: "100%", 
                backgroundColor: "#f8fafc", 
                border: "1px solid #cbd5e1", 
                padding: "12px 16px", 
                borderRadius: "8px", 
                fontSize: "14px", 
                color: "#0f172a", 
                outline: "none", 
                boxSizing: "border-box", 
                transition: "all 0.2s"
              }}
              onFocus={e => { e.target.style.borderColor = "#43A047"; e.target.style.boxShadow = "0 0 0 3px rgba(67, 160, 71, 0.15)"; }}
              onBlur={e => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Password Field */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label style={{ fontSize: "14px", fontWeight: 600, color: "#0B2463" }}>Password</label>
              <a href="#" style={{ fontSize: "13px", color: "#43A047", fontWeight: 600, textDecoration: "none" }}>Forgot password?</a>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="new-password"
              style={{
                width: "100%", 
                backgroundColor: "#f8fafc", 
                border: "1px solid #cbd5e1", 
                padding: "12px 16px", 
                borderRadius: "8px", 
                fontSize: "14px", 
                color: "#0f172a", 
                outline: "none", 
                boxSizing: "border-box", 
                transition: "all 0.2s"
              }}
              onFocus={e => { e.target.style.borderColor = "#43A047"; e.target.style.boxShadow = "0 0 0 3px rgba(67, 160, 71, 0.15)"; }}
              onBlur={e => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Submit Button (QiDesk Green) */}
          <button
            type="submit"
            disabled={loading || success}
            style={{
              width: "100%", 
              backgroundColor: "#43A047", 
              color: "#ffffff", 
              border: "none", 
              padding: "14px", 
              borderRadius: "8px", 
              fontSize: "15px", 
              fontWeight: 600, 
              cursor: loading ? "not-allowed" : "pointer", 
              marginTop: "8px", 
              opacity: loading ? 0.8 : 1, 
              transition: "background-color 0.2s, transform 0.1s"
            }}
            onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = "#388E3C"; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.backgroundColor = "#43A047"; }}
            onMouseDown={e => { if (!loading) (e.target as HTMLButtonElement).style.transform = "scale(0.98)"; }}
            onMouseUp={e => { if (!loading) (e.target as HTMLButtonElement).style.transform = "scale(1)"; }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {/* Feedback Messages */}
          {error && (
            <div style={{ fontSize: "13px", color: "#b91c1c", backgroundColor: "#fef2f2", border: "1px solid #f87171", borderRadius: "6px", padding: "10px", marginTop: "-8px" }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ fontSize: "13px", color: "#15803d", backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", padding: "10px", marginTop: "-8px" }}>
              Authenticated — redirecting to your workspace…
            </div>
          )}

          {/* Footer */}
          <p style={{ textAlign: "center", fontSize: "14px", color: "#4b5563", margin: "16px 0 0 0" }}>
            Don't have an account? <a href="#" style={{ color: "#0B2463", fontWeight: 700, textDecoration: "none" }}>Create account</a>
          </p>
          
        </form>
      </div>
    </div>
  );
}
