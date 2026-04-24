"use client";
import { useState, useEffect } from "react";
import api from "@/lib/axios";
import { X, Search, Check, Shield, ShieldAlert, LogOut, Trash, UserPlus, Camera, Edit2 } from "lucide-react"; 
import { getInitials, getColor } from "@/lib/utils"; 

interface User {
  id: number;
  username: string;
  profile?: {
    avatar: string | null;
    bio: string | null;
  };
}

interface GroupDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: any;
  onUpdate: () => void; // Refresh chat data
  myUserId: number | null;
}

export default function GroupDetailsModal({ isOpen, onClose, chat, onUpdate, myUserId }: GroupDetailsModalProps) {
  const [view, setView] = useState<"details" | "add_member">("details");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState(chat?.name || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Derive Admin Status
  const admins = chat?.admins || [];
  const isAdmin = admins.some((a: any) => a.id === myUserId);
  const isCreator = admins.length > 0 && admins[0].id === myUserId; // Assuming first admin is creator for now, or just check if in admins

  useEffect(() => {
    if (chat) {
        setGroupName(chat.name);
        setPreviewUrl(chat.avatar ? (chat.avatar.startsWith("http") ? chat.avatar : `http://localhost:8000${chat.avatar}`) : null);
    }
  }, [chat]);

  // Search Logic for Adding Members
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (view === "add_member" && query.trim().length > 0) {
        const token = localStorage.getItem("access_token");
        try {
            const res = await api.get(`/users/search/?search=${query}`);
            // Filter out existing participants
            const existingIds = new Set(chat.participants.map((p: any) => p.id));
            setSearchResults(res.data.filter((u: User) => !existingIds.has(u.id)));
        } catch (e) { console.error(e); }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [query, view, chat]);

  const handleAction = async (action: string, userId?: number, extraData?: any) => {
    const token = localStorage.getItem("access_token");
    try {
        if (action === "update_details") {
            const formData = new FormData();
            if (extraData.name) formData.append("name", extraData.name);
            if (avatarFile) formData.append("avatar", avatarFile);

            await api.put(`/conversations/${chat.id}/update/`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setIsEditingName(false);
            setAvatarFile(null); // Reset after save
        } else {
            const payload: any = { action, user_id: userId };
            if (extraData?.user_ids) payload.user_ids = extraData.user_ids;
            
            await api.post(`/conversations/${chat.id}/action/`, payload);
        }
        onUpdate(); // Refresh Parent
        if (action === "leave") onClose();
        if (action === "add_member") {
            setView("details");
            setSelectedUsers([]);
            setQuery("");
        }
    } catch (error) {
        console.error(`Failed to ${action}`, error);
        alert(`Failed to ${action}`);
    }
  };

  const handleAddSelected = async () => {
      // Add all selected users in a single batch request
      const userIds = selectedUsers.map(u => u.id);
      if (userIds.length > 0) {
          await handleAction("add_member", undefined, { user_ids: userIds });
      }
  };

  if (!isOpen || !chat) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5B7083]/40 backdrop-blur-sm p-4">
      <div className="bg-black w-full max-w-md rounded-2xl border border-[#2F3336] shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#2F3336] flex justify-between items-center">
          <h2 className="text-xl font-bold text-[#E7E9EA]">
            {view === "details" ? "Group Info" : "Add Members"}
          </h2>
          <button onClick={() => {
              if (view === "add_member") setView("details");
              else onClose();
          }} className="p-2 hover:bg-[#EFF3F4]/10 rounded-full transition"><X className="text-[#EFF3F4]" size={20} /></button>
        </div>

        {/* DETAILS VIEW */}
        {view === "details" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                {/* Group Header Info */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-full bg-[#333639] flex items-center justify-center text-white font-bold text-3xl overflow-hidden relative group">
                        {previewUrl ? (
                            <img src={previewUrl} alt="Group Avatar" className="w-full h-full object-cover" />
                        ) : (
                            chatName(chat).slice(0, 2).toUpperCase()
                        )}
                        
                        {/* Image Upload */}
                        {isAdmin && isEditingName && (
                            <>
                                <input 
                                    type="file" 
                                    id="group-avatar-upload"
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setAvatarFile(file);
                                            setPreviewUrl(URL.createObjectURL(file));
                                        }
                                    }}
                                />
                                <label htmlFor="group-avatar-upload" className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-100 cursor-pointer">
                                    <Camera size={24} className="text-white"/>
                                </label>
                            </>
                        )}
                        
                        {isAdmin && !isEditingName && (
                             <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer" onClick={() => setIsEditingName(true)}>
                                 <Edit2 size={24} className="text-white"/>
                             </div>
                        )}
                    </div>
                    
                    {isEditingName ? (
                        <div className="flex items-center gap-2 w-full max-w-xs">
                            <input 
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                className="bg-[#202327] text-white px-3 py-1 rounded border border-[#333639] flex-1"
                                autoFocus
                            />
                            <button onClick={() => handleAction("update_details", undefined, { name: groupName })} className="p-1 bg-[#00BA7C] rounded text-black"><Check size={18}/></button>
                            <button onClick={() => { 
                                setGroupName(chat.name); 
                                setIsEditingName(false);
                                setAvatarFile(null);
                                setPreviewUrl(chat.avatar ? (chat.avatar.startsWith("http") ? chat.avatar : `http://localhost:8000${chat.avatar}`) : null);
                            }} className="p-1 bg-[#F4212E] rounded text-white"><X size={18}/></button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-[#E7E9EA]">{chat.name}</h3>
                            {isAdmin && <button onClick={() => setIsEditingName(true)} className="text-[#71767B] hover:text-white"><Edit2 size={16}/></button>}
                        </div>
                    )}
                    <p className="text-[#71767B] text-sm">{chat.participants.length} members</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-center">
                    {isAdmin && (
                        <button 
                            onClick={() => setView("add_member")}
                            className="flex items-center gap-2 px-4 py-2 bg-[#EFF3F4] text-black rounded-full font-bold hover:bg-[#D7DBDC] transition"
                        >
                            <UserPlus size={18} /> Add Members
                        </button>
                    )}
                </div>

                {/* Participants List */}
                <div className="space-y-1">
                    <h4 className="text-[#71767B] font-bold text-sm mb-2 uppercase tracking-wider">Participants</h4>
                    {chat.participants.map((p: any) => {
                        const isUserAdmin = chat.admins.some((a: any) => a.id === p.id);
                        const isMe = p.id === myUserId;

                        return (
                            <div key={p.id} className="flex items-center justify-between p-2 hover:bg-[#16181C] rounded-xl group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#333639] flex items-center justify-center overflow-hidden">
                                        {p.profile?.avatar ? (
                                            <img src={p.profile.avatar.startsWith("http") ? p.profile.avatar : `http://localhost:8000${p.profile.avatar}`} className="w-full h-full object-cover" />
                                        ) : getInitials(p.username)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <span className="font-bold text-[#E7E9EA]">{p.username} {isMe && "(You)"}</span>
                                            {isUserAdmin && <Shield size={14} className="text-[#00BA7C]" fill="currentColor" />}
                                        </div>
                                        <div className="text-xs text-[#71767B]">@{p.username}</div>
                                    </div>
                                </div>
                                
                                {/* Context Actions */}
                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition">
                                    {isAdmin && !isMe && (
                                        <>
                                            {isUserAdmin ? (
                                                <button onClick={() => handleAction("dismiss_admin", p.id)} className="p-1.5 text-[#F4212E] hover:bg-[#F4212E]/10 rounded-full" title="Dismiss as Admin">
                                                    <ShieldAlert size={16} />
                                                </button>
                                            ) : (
                                                <button onClick={() => handleAction("promote_admin", p.id)} className="p-1.5 text-[#00BA7C] hover:bg-[#00BA7C]/10 rounded-full" title="Make Admin">
                                                    <Shield size={16} />
                                                </button>
                                            )}
                                            <button onClick={() => handleAction("remove_member", p.id)} className="p-1.5 text-[#F4212E] hover:bg-[#F4212E]/10 rounded-full" title="Remove User">
                                                <X size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Leave Group */}
                <div className="border-t border-[#2F3336] pt-4">
                     <button 
                        onClick={() => {
                            if (window.confirm("Are you sure you want to leave this group?")) {
                                handleAction("leave");
                            }
                        }}
                        className="w-full py-3 text-[#F4212E] hover:bg-[#F4212E]/10 rounded-xl font-bold flex items-center justify-center gap-2 transition"
                    >
                        <LogOut size={20} /> Leave Group
                    </button>
                </div>

            </div>
        )}

        {/* ADD MEMBER VIEW */}
        {view === "add_member" && (
            <div className="flex-1 flex flex-col">
                <div className="p-4 border-b border-[#2F3336]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71767B]" size={18} />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search people to add..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-[#202327] text-[#E7E9EA] pl-10 pr-4 py-3 rounded-full focus:outline-none focus:bg-black focus:ring-1 focus:ring-white border border-transparent focus:border-white placeholder-[#71767B] transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {searchResults.map(user => {
                        const isSelected = selectedUsers.some(u => u.id === user.id);
                        return (
                             <div
                                key={user.id}
                                onClick={() => {
                                    if (isSelected) setSelectedUsers(prev => prev.filter(u => u.id !== user.id));
                                    else setSelectedUsers(prev => [...prev, user]);
                                }}
                                className={`w-full p-3 flex items-center gap-3 rounded-xl transition text-left cursor-pointer hover:bg-[#16181C] ${isSelected ? 'bg-[#16181C]' : ''}`}
                              >
                                {/* Avatar */}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden ${!user.profile?.avatar && getColor(user.username)}`}>
                                  {user.profile?.avatar ? (
                                      <img src={user.profile.avatar.startsWith("http") ? user.profile.avatar : `http://localhost:8000${user.profile.avatar}`} className="w-full h-full object-cover" />
                                  ) : getInitials(user.username)}
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-[#E7E9EA]">{user.username}</div>
                                    <div className="text-[#71767B] text-sm">@{user.username}</div>
                                </div>
                                {isSelected ? <Check size={20} className="text-[#00BA7C]" /> : <div className="w-5 h-5 border-2 border-[#71767B] rounded-full" />}
                              </div>
                        )
                    })}
                </div>

                <div className="p-4 border-t border-[#2F3336]">
                    <button
                        onClick={handleAddSelected}
                        disabled={selectedUsers.length === 0}
                        className="w-full bg-[#EFF3F4] hover:bg-[#D7DBDC] text-black py-3 rounded-full font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        Add {selectedUsers.length} Member{selectedUsers.length !== 1 && 's'}
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}

// Helper
const chatName = (chat: any) => chat.is_group ? chat.name : "Chat";
