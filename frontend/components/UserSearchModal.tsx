"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import { X, Search, Check, Users, ArrowRight } from "lucide-react"; 
import { getInitials, getColor } from "@/lib/utils"; 

interface User {
  id: number;
  username: string;
}

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChatCreated: () => void; // Callback to refresh sidebar
}

export default function UserSearchModal({ isOpen, onClose, onChatCreated }: UserSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  
  // Group Mode States
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState("");

  // Search Logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length > 0) {
        const token = localStorage.getItem("access_token");
        const res = await axios.get(`http://localhost:8000/api/users/search/?search=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setResults(res.data);
      } else {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Handle User Click
  const handleUserClick = async (user: User) => {
    // A. Group Mode: Toggle Selection
    if (isGroupMode) {
      if (selectedUsers.some(u => u.id === user.id)) {
        setSelectedUsers(prev => prev.filter(u => u.id !== user.id)); // Remove
      } else {
        setSelectedUsers(prev => [...prev, user]); // Add
      }
      return;
    }

    // B. DM Mode: Create instantly
    await createChat({ user_id: user.id, is_group: false });
  };

  // Create Chat Function (Calls Django)
  const createChat = async (payload: any) => {
    try {
      const token = localStorage.getItem("access_token");
      await axios.post("http://localhost:8000/api/conversations/", payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onChatCreated(); // Refresh Sidebar
      onClose();       // Close Modal
      // Reset States
      setIsGroupMode(false);
      setSelectedUsers([]);
      setGroupName("");
    } catch (error) {
      console.error("Failed to create chat", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5B7083]/40 backdrop-blur-sm p-4">
      <div className="bg-black w-full max-w-md rounded-2xl border border-[#2F3336] shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#2F3336] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-[#E7E9EA]">
              {isGroupMode ? "New Group" : "New Chat"}
            </h2>
            {/* Toggle Switch */}
            <button 
              onClick={() => setIsGroupMode(!isGroupMode)}
              className={`text-xs px-3 py-1.5 rounded-full font-bold transition ${isGroupMode ? "bg-[#EFF3F4] text-black border border-transparent" : "border border-[#536471] text-[#EFF3F4] hover:bg-[#EFF3F4]/10"}`}
            >
              {isGroupMode ? "Switch to DM" : "Create Group?"}
            </button>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#EFF3F4]/10 rounded-full transition"><X className="text-[#EFF3F4]" size={20} /></button>
        </div>

        {/* Group Name Input (Only visible in Group Mode) */}
        {isGroupMode && (
          <div className="p-4 border-b border-[#2F3336]">
            <input
              type="text"
              placeholder="Enter Group Name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-black text-[#E7E9EA] px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-white border border-[#2F3336] placeholder-[#71767B]"
            />
          </div>
        )}

        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71767B] group-focus-within:text-white" size={18} />
            <input
              autoFocus
              type="text"
              placeholder="Search people..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-[#202327] text-[#E7E9EA] pl-10 pr-4 py-3 rounded-full focus:outline-none focus:bg-black focus:ring-1 focus:ring-white border border-transparent focus:border-white placeholder-[#71767B] transition-all"
            />
          </div>
        </div>

        {/* Selected Users Pills (Group Mode) */}
        {isGroupMode && selectedUsers.length > 0 && (
          <div className="px-4 py-2 flex flex-wrap gap-2">
            {selectedUsers.map(u => (
              <span key={u.id} className="bg-[#EFF3F4] text-black text-sm px-3 py-1 rounded-full border border-transparent flex items-center gap-1 font-medium">
                {u.username}
                <button onClick={() => handleUserClick(u)} className="hover:bg-black/10 rounded-full p-0.5"><X size={14}/></button>
              </span>
            ))}
          </div>
        )}

        {/* User List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {results.map((user: any) => {
            const isSelected = selectedUsers.some(u => u.id === user.id);
            const status = user.connection_status || 'none'; // connected, pending_sent, pending_received, none

            return (
              <div
                key={user.id}
                className={`w-full p-3 flex items-center gap-3 rounded-xl transition text-left group hover:bg-[#16181C] ${isSelected ? 'bg-[#16181C]' : ''}`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden ${!user.profile?.avatar && getColor(user.username)}`}>
                  {user.profile?.avatar ? (
                      <img 
                        src={user.profile.avatar.startsWith("http") ? user.profile.avatar : `http://localhost:8000${user.profile.avatar}`}
                        alt={user.username} 
                        className="w-full h-full object-cover"
                      />
                  ) : (
                      getInitials(user.username)
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#E7E9EA] text-[15px] truncate">{user.username}</div>
                  <div className="text-[#71767B] text-sm truncate">@{user.username}</div>
                </div>

                {/* Actions */}
                {isGroupMode ? (
                    <button onClick={() => handleUserClick(user)} className={`p-2 rounded-full ${isSelected ? "text-[#00BA7C]" : "text-[#71767B] hover:bg-white/10 hover:text-white"}`}>
                        {isSelected ? <Check size={20} /> : <div className="w-5 h-5 border-2 border-[#71767B] rounded-full" />}
                    </button>
                ) : (
                    <div className="flex items-center">
                        {status === 'connected' && (
                            <button 
                                onClick={() => createChat({ user_id: user.id })}
                                className="px-3 py-1.5 bg-[#EFF3F4] text-black text-xs font-bold rounded-full hover:bg-[#D7DBDC]"
                            >
                                Message
                            </button>
                        )}
                        {status === 'pending_sent' && (
                            <span className="text-[#71767B] text-xs font-medium px-2">Request Sent</span>
                        )}
                        {status === 'pending_received' && (
                            <span className="text-white text-xs font-medium px-2">Check Notifications</span>
                        )}
                        {(status === 'none' || status === 'rejected') && (
                            <button 
                                onClick={async () => {
                                    const token = localStorage.getItem("access_token");
                                    try {
                                        await axios.post("http://localhost:8000/api/users/request/send/", 
                                            { user_id: user.id },
                                            { headers: { Authorization: `Bearer ${token}` } }
                                        );
                                        // Refresh search logic to update status (simple hack: clear and re-search or manual update)
                                        setResults(prev => prev.map(u => u.id === user.id ? { ...u, connection_status: 'pending_sent' } : u));
                                    } catch (err) {
                                        console.error("Failed to send request", err);
                                        alert("Failed to send request");
                                    }
                                }}
                                className="px-3 py-1.5 border border-[#536471] text-[#EFF3F4] text-xs font-bold rounded-full hover:bg-[#EFF3F4]/10"
                            >
                                Connect
                            </button>
                        )}
                    </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Create Button (Group Mode Only) */}
        {isGroupMode && (
          <div className="p-4 border-t border-[#2F3336]">
            <button
              onClick={() => createChat({ 
                is_group: true, 
                name: groupName, 
                participant_ids: selectedUsers.map(u => u.id) 
              })}
              disabled={selectedUsers.length === 0 || !groupName.trim()}
              className="w-full bg-[#EFF3F4] hover:bg-[#D7DBDC] text-black py-3 rounded-full font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Create Group <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}