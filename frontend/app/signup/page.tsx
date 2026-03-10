"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("http://localhost:8000/api/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Signup failed");
      }

      // Auto-login (save tokens)
      localStorage.setItem("access_token", data.tokens.access);
      localStorage.setItem("refresh_token", data.tokens.refresh);

      // Redirect to Profile Setup
      router.push("/setup-profile");

    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-black relative overflow-hidden">
        {/* Video Background - Reusing login style if possible, or just dark bg for now as per instructions "Video Background + Glassmorphism" implies reusing existing assets if available, but I don't see a video file in list_dir. I'll stick to the black bg and glassmorphism style from Login which used a black bg in the view_file output. Wait, the login page viewed earlier had `bg-black` but commented out `Video Background`? No, the user request says "Clone the style of the Login page (Video Background + Glassmorphism)". The login page code I saw had `bg-black`. I will stick to `bg-black` to matching the actual code I read, or potential `bg-black` with the image. 
        Actually, let's look at login page again. 
        It has `<div className="flex h-screen items-center justify-center bg-black">`. 
        I will follow the code I saw. 
        */}
        
      <div className="absolute inset-0 z-0">
         {/* Placeholder for video if it were there, but sticking to black for consistency with viewed login code */}
      </div>

      <div className="w-full max-w-sm p-8 rounded-2xl flex flex-col gap-6 z-10 bg-black/50 backdrop-blur-md border border-white/10">
        
        <div className="flex justify-center mb-4">
            <img src="/assets/bolt-logo.png" alt="Bolt Logo" className="h-16 w-auto" />
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 text-center">Create your account</h2>
        
        {error && <div className="bg-[#f4212e]/10 text-[#f4212e] px-4 py-3 rounded-xl text-sm font-medium border border-[#f4212e]/20">{error}</div>}

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Username"
            className="w-full bg-black text-white px-4 py-4 rounded-full border border-[#333639] focus:border-white focus:outline-none focus:ring-1 focus:ring-white placeholder-[#71767B] transition"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="email"
            placeholder="Email"
            className="w-full bg-black text-white px-4 py-4 rounded-full border border-[#333639] focus:border-white focus:outline-none focus:ring-1 focus:ring-white placeholder-[#71767B] transition"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full bg-black text-white px-4 py-4 rounded-full border border-[#333639] focus:border-white focus:outline-none focus:ring-1 focus:ring-white placeholder-[#71767B] transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            className="w-full bg-white text-black py-3.5 rounded-full font-bold text-[17px] hover:bg-[#D7DBDC] transition mt-2"
          >
            Sign Up
          </button>
          
        </form>
        
        <p className="text-[#71767B] text-sm mt-4 text-center">
            Already have an account? <a href="/login" className="text-white hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
