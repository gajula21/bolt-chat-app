"use client";
import { useState, useEffect } from "react";
import api from "@/lib/axios";
import { X, Search, Send, User, Users } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface ForwardSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageContent: string | null;
  onForward: () => void; // Callback after successful forward
  myUserId: number | null;
}

export default function ForwardSelectionModal({ isOpen, onClose, messageContent, onForward, myUserId }: ForwardSelectionModalProps) {
  const [query, setQuery] = useState("");
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);

  // Fetch recent chats on open
  useEffect(() => {
    if (isOpen) {
      api.get("/conversations/")
      .then(res => setRecentChats(res.data))
      .catch(err => console.error("Failed to fetch chats", err));
    }
  }, [isOpen]);

  // Search logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length > 0) {
        try {
            // Search Users
            const res = await api.get(`/users/search/?search=${query}`);
            setSearchResults(res.data);
            // TODO: Also search groups if we had a group search endpoint? 
            // For now, rely on recentChats for groups or client-side filter of recentChats
        } catch (e) { console.error(e); }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedChatIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedChatIds(newSet);
  };

  const handleSend = async () => {
      if (!messageContent || selectedChatIds.size === 0) return;
      setSending(true);
      try {
          const promises = Array.from(selectedChatIds).map(chatId => 
              api.post(`/conversations/${chatId}/send/`, { content: messageContent })
          );
          
          await Promise.all(promises);
          onForward();
          onClose();
          setSelectedChatIds(new Set());
      } catch (error) {
          console.error("Forwarding failed", error);
          alert("Failed to forward message");
      } finally {
          setSending(false);
      }
  };

  // Helper to handle selecting a search result (User) -> need to find or create conversation
  const handleSelectUser = async (user: any) => {
      // Check if we already have a DM with this user in recentChats
      // This logic is a bit complex because we need the Conversation ID to send.
      // If we select a user from search who isn't in recent chats, we might need to "create" or "get" the DM ID first.
      
      // For simplicity in this version:
      // 1. If user is in recentChats (DM), toggle that chat ID.
      // 2. If not, we theoretically need to Create DM. 
      //    Let's auto-create DM for now? Or just restrict to recent chats + existing DMs?
      
      // Fast path: Check recent chats
      const existingChat = recentChats.find(c => !c.is_group && c.participants.some((p: any) => p.id === user.id));
      if (existingChat) {
          toggleSelection(existingChat.id);
          return;
      }

      // If not found, we need to create/get DM.
      try {
          const res = await api.post("/conversations/", { user_id: user.id });
          // Add to recent chats and select
          setRecentChats(prev => [res.data, ...prev]);
          toggleSelection(res.data.id);
      } catch (e) {
          console.error("Failed to get DM", e);
      }
  };

  if (!isOpen) return null;

  // Filter recent chats based on query if search results are empty? 
  // Or just show Search Results separate from Recents.
  // Let's show Recents by default, and Search Results if query exists.
  
  const displayList = query ? searchResults : recentChats;
  const isSearching = !!query;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5B7083]/40 backdrop-blur-sm p-4">
      <div className="bg-black w-full max-w-md rounded-2xl border border-[#2F3336] shadow-2xl flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#2F3336] flex justify-between items-center">
          <h2 className="text-xl font-bold text-[#E7E9EA]">Forward Message</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#EFF3F4]/10 rounded-full transition">
            <X className="text-[#EFF3F4]" size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[#2F3336]">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71767B]" size={18} />
                <input
                    type="text"
                    placeholder="Search people or groups..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-[#202327] text-[#E7E9EA] pl-10 pr-4 py-3 rounded-full focus:outline-none focus:bg-black focus:ring-1 focus:ring-white border border-transparent focus:border-white placeholder-[#71767B] transition-all"
                />
            </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
            {displayList.length === 0 && (
                <div className="text-center text-[#71767B] mt-4">No results found</div>
            )}
            
            {displayList.map(item => {
                // Determine if item is a Chat or a User (Search Result)
                // Search Results (Users) don't have 'is_group' usually, unless we unify.
                // My UserSearchView returns list of Users.
                // RecentChats returns list of Conversations.
                
                let id, name, avatar, subtitle, isGroup;
                
                if (isSearching) {
                    // Item is User
                    id = item.id;
                    name = item.username;
                    avatar = item.profile?.avatar;
                    subtitle = `@${item.username}`;
                    isGroup = false;
                    
                    // We need a way to know if this User *is* selected (via their DM chat ID).
                    // This is tricky visually. 
                    // Let's rely on handleSelectUser to check/create the DM and then we check if that DM ID is in selectedChatIds.
                    // But for rendering "Selected" state on a USER result, we need to know the Chat ID associated with them.
                    // For now, let's just show checkmark if we find the chat in recentChats that corresponds to them and is selected.
                    const chat = recentChats.find(c => !c.is_group && c.participants.some((p: any) => p.id === item.id));
                    var isSelected = chat ? selectedChatIds.has(chat.id) : false;
                } else {
                    // Item is Converastion
                    id = item.id;
                    isGroup = item.is_group;
                    
                    // Logic to clear "DM-X-Y" names if they exist, or just use participants
                    // If it is a group, use item.name
                    // If it is a DM, find the other participant
                    
                    if (isGroup) {
                        name = item.name;
                        subtitle = "Group";
                        avatar = item.avatar; // Use group avatar from response
                    } else {
                        const otherMode = item.participants.find((p: any) => p.id !== myUserId);
                        const otherUser = otherMode || item.participants[0]; // Fallback
                        name = otherUser ? otherUser.username : "Unknown";
                        avatar = otherUser?.profile?.avatar;
                        subtitle = "Direct Message";
                    }
                    
                    isSelected = selectedChatIds.has(id);
                }

                return (
                    <div
                        key={isSearching ? `user-${id}` : `chat-${id}`}
                        onClick={() => isSearching ? handleSelectUser(item) : toggleSelection(id)}
                        className={`w-full p-3 flex items-center gap-3 rounded-xl transition text-left cursor-pointer hover:bg-[#16181C] ${isSelected ? 'bg-[#16181C]' : ''}`}
                    >
                        <div className="w-10 h-10 rounded-full bg-[#333639] flex items-center justify-center overflow-hidden text-white font-bold">
                             {avatar ? (
                                  <img src={avatar.startsWith("http") ? avatar : `http://localhost:8000${avatar}`} className="w-full h-full object-cover" />
                              ) : getInitials(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-[#E7E9EA] truncate">{name}</div>
                            <div className="text-[#71767B] text-sm truncate">{subtitle}</div>
                        </div>
                         {isSelected ? (
                             <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                 <Send size={14} className="text-black" />
                             </div>
                         ) : (
                             <div className="w-6 h-6 border-2 border-[#71767B] rounded-full" />
                         )}
                    </div>
                );
            })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2F3336] flex justify-between items-center bg-[#16181C] rounded-b-2xl">
            <div className="text-[#71767B] text-sm">
                {selectedChatIds.size} selected
            </div>
            <button
                onClick={handleSend}
                disabled={selectedChatIds.size === 0 || sending}
                className="bg-[#EFF3F4] hover:bg-[#D7DBDC] text-black px-6 py-2 rounded-full font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
                {sending ? "Sending..." : "Send"}
                <Send size={18} />
            </button>
        </div>

      </div>
    </div>
  );
}
