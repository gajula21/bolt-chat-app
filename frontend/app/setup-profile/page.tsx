"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";

export default function SetupProfilePage() {
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("bio", bio);
      if (avatar) {
        formData.append("avatar", avatar);
      }

      await api.put("/users/profile/update/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      // Success -> Redirect Home
      router.push("/");

    } catch (err: any) {
      console.error(err);
      setError("Failed to update profile");
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="w-full max-w-sm p-8 rounded-2xl flex flex-col gap-6 border border-[#333639]">
        
        <div className="text-center">
             <h2 className="text-3xl font-bold text-white mb-2">Setup Profile</h2>
             <p className="text-[#71767B]">Let's get you ready to chat.</p>
        </div>

        {error && <div className="bg-[#f4212e]/10 text-[#f4212e] px-4 py-3 rounded-xl text-sm font-medium border border-[#f4212e]/20">{error}</div>}

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          
          {/* Avatar Upload */}
          <div className="flex flex-col items-center">
            <label className="cursor-pointer relative group">
                <div className="w-24 h-24 rounded-full bg-[#16181C] border-2 border-[#333639] flex items-center justify-center overflow-hidden">
                    {avatar ? (
                        <img src={URL.createObjectURL(avatar)} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-2xl text-[#71767B]">📷</span>
                    )}
                </div>
                <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => setAvatar(e.target.files?.[0] || null)}
                />
                <div className="mt-2 text-[#1d9bf0] text-sm font-medium">Upload Photo</div>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-white font-medium ml-1">Bio</label>
            <input
                type="text"
                placeholder="e.g. At the gym"
                className="w-full bg-black text-white px-4 py-4 rounded-xl border border-[#333639] focus:border-white focus:outline-none focus:ring-1 focus:ring-white placeholder-[#71767B] transition"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black py-3.5 rounded-full font-bold text-[17px] hover:bg-[#D7DBDC] transition mt-2 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save & Continue"}
          </button>
          
        </form>
      </div>
    </div>
  );
}