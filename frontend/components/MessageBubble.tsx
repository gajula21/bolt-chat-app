import { useState } from "react";
import { cn, getInitials, getColor } from "@/lib/utils";
import { Check, CheckCheck, Reply, Edit2, Trash2, MoreHorizontal, CornerUpRight } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface MessageBubbleProps {
  id: number;
  content: string;
  isMe: boolean;
  sender: string;
  avatarUrl?: string | null;
  isRead?: boolean;
  timestamp?: string;
  createdAt?: string; // Add this
  isDeleted?: boolean;
  onReply: (id: number, sender: string, content: string) => void;
  onEdit?: (id: number, content: string) => void;
  onDelete?: (id: number, type: "me" | "everyone") => void;
  onForward?: () => void;
  onAvatarClick?: (url: string) => void;
}

export default function MessageBubble({ id, content, isMe, sender, avatarUrl, isRead, timestamp, createdAt, isDeleted, onReply, onEdit, onDelete, onForward, onAvatarClick }: MessageBubbleProps) {
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  // Check 5-minute limit
  const canEditOrDeleteEveryone = createdAt ? (new Date().getTime() - new Date(createdAt).getTime()) < 5 * 60 * 1000 : true;


  return (
    <div className={cn("flex w-full mt-2 space-x-3 max-w-3xl group", isMe ? "ml-auto justify-end" : "")}>
      
      {/* Avatar (Only show for others) */}
      {!isMe && (
        <div 
            className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 overflow-hidden transition-transform active:scale-95", !avatarUrl && getColor(sender), onAvatarClick && "cursor-pointer hover:opacity-80")}
            onClick={() => avatarUrl && onAvatarClick?.(avatarUrl)}
        >
          {avatarUrl ? (
            <img 
              src={avatarUrl.startsWith("http") ? avatarUrl : `http://localhost:8000${avatarUrl}`}
              alt={sender} 
              className="w-full h-full object-cover"
            />
          ) : (
            getInitials(sender)
          )}
        </div>
      )}

      <div className={cn(
        "relative px-4 py-3 shadow-none max-w-[85%] group",
        isMe 
          ? "bg-white text-black rounded-[22px] rounded-br-none" 
          : "bg-[#2F3336] text-[#E7E9EA] rounded-[22px] rounded-bl-none",
          isDeleted && "italic text-opacity-60 bg-opacity-60"
      )}>
        {/* Sender Name (Only in Group Chats for others) */}
        {!isMe && <p className="text-xs text-[#71767B] font-medium mb-1">{sender}</p>}
        
        {/* Actions (Reply/Edit/Delete) - Visible on Hover */}
        {!isDeleted && (
            <div className={cn(
                "absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2",
                isMe ? "-left-24" : "-right-24"
            )}>
                {/* Delete Menu */}
                {showDeleteMenu ? (
                    <div className="flex flex-col bg-black border border-[#2F3336] rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 absolute bottom-full mb-2 z-10 w-40">
                        <button 
                            onClick={() => { onDelete?.(id, "me"); setShowDeleteMenu(false); }}
                            className="px-4 py-2 text-left text-sm text-[#E7E9EA] hover:bg-[#16181C] hover:text-[#F4212E] transition-colors"
                        >
                            Delete for me
                        </button>
                        {isMe && canEditOrDeleteEveryone && (
                            <button 
                                onClick={() => { onDelete?.(id, "everyone"); setShowDeleteMenu(false); }}
                                className="px-4 py-2 text-left text-sm text-[#E7E9EA] hover:bg-[#16181C] hover:text-[#F4212E] transition-colors border-t border-[#2F3336]"
                            >
                                Delete for everyone
                            </button>
                        )}
                         <div className="bg-[#2F3336] h-[1px]" />
                         <button 
                            onClick={() => setShowDeleteMenu(false)}
                            className="px-4 py-1 text-center text-xs text-[#71767B] hover:bg-[#16181C] transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                     onDelete && (
                        <button 
                            onClick={() => setShowDeleteMenu(true)}
                            className="p-1.5 bg-[#2F3336] text-[#71767B] hover:text-[#F4212E] rounded-full transition-colors"
                            title="Delete"
                        >
                            <Trash2 size={14} />
                        </button>
                     )
                )}

                <button 
                    onClick={() => onReply(id, sender, content)}
                    className="p-1.5 bg-[#2F3336] text-[#71767B] hover:text-[#E7E9EA] rounded-full"
                    title="Reply"
                >
                    <Reply size={14} />
                </button>
                {onForward && (
                    <button 
                        onClick={onForward}
                        className="p-1.5 bg-[#2F3336] text-[#71767B] hover:text-[#E7E9EA] rounded-full"
                        title="Forward"
                    >
                        <CornerUpRight size={14} />
                    </button>
                )}
                {isMe && onEdit && canEditOrDeleteEveryone && (
                    <button 
                        onClick={() => onEdit(id, content)}
                        className="p-1.5 bg-[#2F3336] text-[#71767B] hover:text-[#E7E9EA] rounded-full"
                        title="Edit"
                    >
                        <Edit2 size={14} />
                    </button>
                )}
            </div>
        )}

        <div className="text-[15px] leading-relaxed pr-6 markdown-content">
          {isDeleted ? (
              <span className="flex items-center gap-2 text-sm text-[#536471]">
                  <Trash2 size={14} /> This message was deleted
              </span>
          ) : (
            <ReactMarkdown
                components={{
                code({ node, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const isInline = !match && !String(children).includes("\n");
                    return isInline ? (
                    <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded font-mono text-sm" {...props}>
                        {children}
                    </code>
                    ) : (
                    <div className="my-2 rounded-md overflow-hidden bg-[#1e1e1e] text-white">
                        <div className="px-3 py-1 bg-[#2d2d2d] text-xs text-gray-400 border-b border-[#3e3e3e]">
                        {match ? match[1] : "code"}
                        </div>
                        <code className="block p-3 font-mono text-sm overflow-x-auto" {...props}>
                        {children}
                        </code>
                    </div>
                    );
                }
                }}
            >
                {content}
            </ReactMarkdown>
          )}
        </div>
        
        {/* Timestamp & Ticks */}
        <div className={cn("flex items-center justify-end gap-1 mt-1 opacity-70", isMe ? "text-black/60" : "text-[#71767B]")}>
          <span className="text-[11px]">
            {timestamp || "10:42 AM"}
          </span>
          
          {/* Read Receipts (Only for Me) */}
          {isMe && !isDeleted && (
            <span>
              {isRead ? <CheckCheck size={14} className="text-black" /> : <Check size={14} className="text-black/60" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}