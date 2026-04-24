"use client";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/axios";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Search, Plus, MessageSquare, Users, Settings, LogOut } from "lucide-react";
import { getInitials, getColor, formatDateLabel } from "@/lib/utils";
import UserSearchModal from "./UserSearchModal";
import ProfileSettingsModal from "./ProfileSettingsModal";

interface SidebarProps {
  onSelectChat: (chat: any) => void;
  selectedChatId: number | null;
  onlineUsers: Set<number>;
  myUserId: number | null; // Accept myUserId prop
}

interface User {
  id: number;
  username: string;
  email: string;
  profile?: {
    avatar: string | null;
    bio: string | null;
  };
}

export default function Sidebar({ onSelectChat, selectedChatId, onlineUsers, myUserId }: SidebarProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]); // New State
  const [view, setView] = useState<"messages" | "notifications">("messages"); // New State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const router = useRouter();

  const fetchCurrentUser = async (signal?: AbortSignal) => {
    try {
      const res = await api.get("/users/me/", {
        signal
      });
      setCurrentUser(res.data);
    } catch (error) {
      if (axios.isCancel(error)) return;
      console.error("Error fetching current user:", error);
    }
  };

  const fetchChats = async (signal?: AbortSignal) => {
    try {
      const res = await api.get("/conversations/", {
        signal
      });
      setConversations(res.data);
    } catch (error) {
      if (axios.isCancel(error)) return;
      console.error(error);
    }
  };

  const fetchPendingRequests = async (signal?: AbortSignal) => {
    try {
      const res = await api.get("/users/requests/pending/", {
        signal
      });
      setPendingRequests(res.data);
    } catch (error: any) {
      if (axios.isCancel(error)) return;
      console.error("Error fetching requests:", error);
    }
  };

  const handleResponse = async (requestId: number, action: "accept" | "reject") => {
      try {
          const res = await api.post(`/users/request/respond/${requestId}/`, 
              { action }
          );
          
          setPendingRequests(prev => prev.filter(req => req.id !== requestId));
          
          if (action === "accept" && res.data.conversation_id) {
              await fetchChats(); // No signal passed here, let it run
              setView("messages");
              const newChat = conversations.find(c => c.id === res.data.conversation_id);
              if (newChat) onSelectChat(newChat);
          }
      } catch (error) {
          console.error("Error responding to request:", error);
      }
  };

  useEffect(() => { 
    const controller = new AbortController();
    fetchChats(controller.signal); 
    fetchCurrentUser(controller.signal);
    fetchPendingRequests(controller.signal);
    
    // Poll for new requests every 30s
    // For polling, we might not want to cancel the *interval* requests with the same controller if the component remains mounted.
    // But if component unmounts, we clear interval.
    // The fetch inside interval won't share the main controller signal unless we want it to cancel on unmount.
    // We can't pass 'controller.signal' easily if it's already aborted? No, unmount aborts it.
    // So passing it is correct.
    const interval = setInterval(() => fetchPendingRequests(controller.signal), 30000);
    
    const handleProfileUpdate = (e: any) => {
        const { user_id, profile } = e.detail;
        if (currentUser && user_id === currentUser.id) {
            setCurrentUser(prev => prev ? { ...prev, profile } : prev);
        }
        setConversations(prev => prev.map(chat => {
            const updatedParticipants = chat.participants.map((p: any) => {
                if (p.id === user_id) {
                    return { ...p, profile };
                }
                return p;
            });
            return { ...chat, participants: updatedParticipants };
        }));
    };

    window.addEventListener("profile_updated", handleProfileUpdate);
    const handleGroupUpdate = () => fetchChats();
    window.addEventListener("group_updated", handleGroupUpdate);

    return () => {
        controller.abort();
        clearInterval(interval);
        window.removeEventListener("profile_updated", handleProfileUpdate);
        window.removeEventListener("group_updated", handleGroupUpdate);
    };
  }, [router]); // Removed currentUser dependency to prevent infinite loops

  return (
    <div className="w-80 bg-black border-r border-[#2F3336] flex flex-col h-full">
      <UserSearchModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onChatCreated={() => { 
          fetchChats(); 
          setIsModalOpen(false); 
        }} 
      />
      
      {/* Header with Tabs */}
      <div className="border-b border-[#2F3336] sticky top-0 bg-black/80 backdrop-blur-md z-10 flex flex-col">
        <div className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <img src="/assets/bolt-logo.png" alt="Bolt" className="w-8 h-8 object-contain" />
                <h1 className="text-xl font-bold text-[#E7E9EA] tracking-tight">Bolt</h1>
            </div>
            <button 
            onClick={() => setIsModalOpen(true)}
            className="p-2 bg-[#EFF3F4] rounded-full hover:bg-[#D7DBDC] transition shadow-lg"
            >
            <Plus size={20} className="text-black" />
            </button>
        </div>
        
        {/* Helper Tabs */}
        <div className="flex w-full">
            <button 
                onClick={() => setView("messages")}
                className={`flex-1 py-3 text-sm font-bold border-b-2 hover:bg-[#EFF3F4]/10 transition ${view === "messages" ? "text-white border-white" : "text-[#71767B] border-transparent"}`}
            >
                Chats
            </button>
            <button 
                onClick={() => setView("notifications")}
                className={`flex-1 py-3 text-sm font-bold border-b-2 hover:bg-[#EFF3F4]/10 transition relative ${view === "notifications" ? "text-white border-white" : "text-[#71767B] border-transparent"}`}
            >
                Requests
                {pendingRequests.length > 0 && (
                    <span className="absolute top-2 right-8 w-2 h-2 bg-white rounded-full"></span>
                )}
            </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-0 space-y-0">
        
        {/* NOTIFICATIONS VIEW */}
        {view === "notifications" && (
            <div className="p-4 space-y-4">
                {pendingRequests.length === 0 ? (
                    <div className="text-center text-[#71767B] mt-10">
                        <Users className="mx-auto mb-2 opacity-50" size={32} />
                        <p>No pending requests</p>
                    </div>
                ) : (
                    pendingRequests.map(req => (
                        <div key={req.id} className="bg-[#16181C] p-3 rounded-xl border border-[#2F3336]">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden bg-[#333639]">
                                    {req.sender.profile?.avatar ? (
                                        <img 
                                            src={req.sender.profile.avatar.startsWith("http") ? req.sender.profile.avatar : `http://localhost:8000${req.sender.profile.avatar}`} 
                                            alt={req.sender.username} 
                                            className="w-full h-full object-cover" 
                                        />
                                    ) : (
                                        getInitials(req.sender.username)
                                    )}
                                </div>
                                <div>
                                    <div className="font-bold text-[#E7E9EA]">{req.sender.username}</div>
                                    <div className="text-xs text-[#71767B]">wants to connect</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleResponse(req.id, "accept")}
                                    className="flex-1 bg-[#EFF3F4] text-black py-1.5 rounded-full font-bold text-sm hover:bg-[#D7DBDC]"
                                >
                                    Accept
                                </button>
                                <button 
                                    onClick={() => handleResponse(req.id, "reject")}
                                    className="flex-1 border border-[#536471] text-[#EFF3F4] py-1.5 rounded-full font-bold text-sm hover:bg-[#EFF3F4]/10"
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        )}

        {/* MESSAGES VIEW */}
        {view === "messages" && conversations.map((chat) => {
          // Calculate "Other User" from participants
          const otherUser = chat.is_group 
            ? null 
            : chat.participants?.find((p: any) => p.id !== myUserId);

          const name = chat.is_group ? chat.name : otherUser?.username || "Unknown";
          const isActive = selectedChatId === chat.id;
          
          // Check Online Status
          const isOnline = !chat.is_group && otherUser && onlineUsers.has(otherUser.id);
          
          if (!chat.is_group) {
              console.log(`[Sidebar] Chat ${chat.id} OtherUser:`, otherUser);
              console.log(`[Sidebar] MyUserId:`, myUserId);
          }

          return (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className={`w-full p-4 flex items-start gap-3 transition-colors duration-200 border-r-2 ${
                isActive ? "bg-[#16181C] border-[#EFF3F4]" : "hover:bg-[#16181C]/50 border-transparent"
              }`}
            >
              <div className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shadow-sm ${isActive ? "bg-[#EFF3F4]" : "bg-[#333639]"}`}>
                  {otherUser?.profile?.avatar && !chat.is_group ? (
                    <img 
                      src={otherUser.profile.avatar.startsWith("http") ? otherUser.profile.avatar : `http://localhost:8000${otherUser.profile.avatar}`}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className={`font-bold text-base ${isActive ? "text-black" : "text-white"}`}>
                      {getInitials(name)}
                    </span>
                  )}
                </div>
                {/* Online Dot in Sidebar */}
                {isOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00BA7C] border-2 border-black rounded-full"></span>
                )}
              </div>

              <div className="flex-1 text-left min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className={`font-bold truncate text-[15px] ${isActive ? "text-[#E7E9EA]" : "text-[#E7E9EA]"}`}>
                    {name}
                  </span>
                  <span className="text-xs text-[#71767B] ml-2 whitespace-nowrap">
                   {chat.last_message?.timestamp ? formatDateLabel(chat.last_message.timestamp) : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[13px] text-[#71767B] truncate mt-0.5">
                  {chat.is_group && <Users size={12} className="mr-1"/>}
                  <span className="truncate">
                    {chat.last_message?.content || "No messages yet"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {/* Footer / Profile Section */}
      <div className="p-4 border-t border-[#2F3336]">
        {currentUser && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[#333639]">
                {currentUser.profile?.avatar ? (
                  <img 
                    src={currentUser.profile.avatar.startsWith("http") ? currentUser.profile.avatar : `http://localhost:8000${currentUser.profile.avatar}`}
                    alt="Avatar" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold">
                    {getInitials(currentUser.username)}
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[#E7E9EA] font-bold text-sm">{currentUser.username}</span>
                <span className="text-[#71767B] text-xs">
                  {currentUser.profile?.bio || "No bio yet"}
                </span>
              </div>
            </div>
            
            <div className="flex gap-2">
                <button
                onClick={() => setIsProfileModalOpen(true)}
                className="p-2 text-[#71767B] hover:text-[#E7E9EA] transition"
                title="Settings"
                >
                <Settings size={20} />
                </button>
                <button 
                    onClick={async () => {
                        try {
                            const refreshToken = localStorage.getItem("refresh_token");
                            if (refreshToken) {
                                await api.post("/logout/", { refresh_token: refreshToken });
                            }
                        } catch (err) {
                            console.error("Logout failed", err);
                        } finally {
                            localStorage.removeItem("access_token");
                            localStorage.removeItem("refresh_token");
                            router.push("/login");
                        }
                    }}
                    className="p-2 text-[#71767B] hover:text-[#F4212E] transition"
                    title="Log out"
                >
                    <LogOut size={20} />
                </button>
            </div>
          </div>
        )}
      </div>

      {currentUser && (
        <ProfileSettingsModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          onUpdate={(updatedUser) => setCurrentUser(updatedUser)}
        />
      )}
    </div>
  );
}