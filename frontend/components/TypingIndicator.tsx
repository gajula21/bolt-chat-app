import React from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  usernames: string[];
}

export default function TypingIndicator({ usernames }: TypingIndicatorProps) {
  if (usernames.length === 0) return null;

  let text = "";
  if (usernames.length === 1) {
    text = `${usernames[0]} is typing...`;
  } else if (usernames.length === 2) {
    text = `${usernames[0]} and ${usernames[1]} are typing...`;
  } else {
    text = "Several people are typing...";
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 opacity-80 animate-in fade-in slide-in-from-bottom-2 duration-300">
       <div className="flex items-center gap-1 bg-[#2F3336] px-3 py-2 rounded-2xl rounded-bl-none">
         <span className="w-1.5 h-1.5 bg-[#71767B] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
         <span className="w-1.5 h-1.5 bg-[#71767B] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
         <span className="w-1.5 h-1.5 bg-[#71767B] rounded-full animate-bounce"></span>
       </div>
       <span className="text-xs text-[#71767B]">{text}</span>
    </div>
  );
}
