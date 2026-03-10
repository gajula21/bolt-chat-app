import { useState } from "react";
import Lightbox from "./Lightbox";

interface UserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: number;
    username: string;
    profile?: {
      avatar?: string;
      bio?: string;
    };
  };
}

export default function UserDetailsModal({ isOpen, onClose, user }: UserDetailsModalProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  if (!isOpen) return null;

  const avatarUrl = user.profile?.avatar || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-black border border-[#333639] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative" 
        onClick={(e) => e.stopPropagation()}
      >
        <button 
            onClick={onClose}
            className="absolute top-3 right-3 text-[#71767B] hover:text-white transition bg-black/50 rounded-full p-1"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div className="flex flex-col items-center p-8">
            <div 
                className="w-32 h-32 rounded-full border-4 border-black overflow-hidden cursor-pointer hover:opacity-90 transition mb-4"
                onClick={() => setIsLightboxOpen(true)}
            >
                <img 
                    src={avatarUrl} 
                    alt={user.username} 
                    className="w-full h-full object-cover" 
                />
            </div>
            
            <h2 className="text-2xl font-bold text-white">{user.username}</h2>
            <p className="text-[#71767B] mb-6">@{user.username}</p>

            <div className="w-full bg-[#16181C] rounded-xl p-4 border border-[#333639]">
                <h3 className="text-[#71767B] text-xs font-bold uppercase tracking-wider mb-2">About</h3>
                <p className="text-white text-[15px] leading-relaxed">
                    {user.profile?.bio || "No bio available"}
                </p>
            </div>
        </div>
      </div>

      {isLightboxOpen && (
        <Lightbox 
            src={avatarUrl} 
            alt={user.username} 
            onClose={() => setIsLightboxOpen(false)} 
        />
      )}
    </div>
  );
}
