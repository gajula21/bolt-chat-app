import { X } from "lucide-react";
import { useEffect } from "react";

interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function Lightbox({ src, alt, onClose }: LightboxProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full transition"
      >
        <X size={32} />
      </button>
      
      <img 
        src={src} 
        alt={alt || "Image"} 
        className="max-h-[90vh] max-w-[90vw] object-contain animate-in zoom-in-95 duration-300 select-none"
        onClick={(e) => e.stopPropagation()} // Prevent close when clicking image
      />
    </div>
  );
}
