"use client";
import { useState, useEffect } from "react";
import api from "@/lib/axios";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";

export default function Home() {
  const [activeChat, setActiveChat] = useState<any>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [myUserId, setMyUserId] = useState<number | null>(null);

  // 1. Fetch Identity
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
        api.get("/users/me/")
        .then(res => setMyUserId(res.data.id))
        .catch(err => console.error(err));
    }
  }, []);

  // 2. Global Presence WebSocket
  useEffect(() => {
    if (!myUserId) return;

    const ws = new WebSocket(`ws://localhost:8001/ws/notify/${myUserId}/`);

    ws.onopen = () => {
        // Send heartbeat every 30s
        const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 30000);
        
        // Store interval to clear later
        (ws as any).heartbeatInterval = interval;
    };

    ws.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "status_update") {
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                if (data.status === "online") {
                    newSet.add(data.user_id);
                } else {
                    newSet.delete(data.user_id);
                }
                return newSet;
            });
        }
        
        else if (data.type === "profile_update") {
            console.log("Global Profile Update Recvd:", data);
            
            // Dispatch a custom event so child components can listen
            // This is a simple way to broadcast to Sidebar and ChatArea without complex Context
            window.dispatchEvent(new CustomEvent("profile_updated", { detail: data }));
        }

        else if (data.type === "group_update") {
            console.log("Global Group Update Recvd:", data);
            window.dispatchEvent(new CustomEvent("group_updated", { detail: data }));
        }
    };

    ws.onclose = () => {
        console.log("Disconnected from Global Lobby");
        if ((ws as any).heartbeatInterval) {
            clearInterval((ws as any).heartbeatInterval);
        }
    };

    // Listen for profile updates to update activeChat
    const handleProfileUpdate = (e: any) => {
        const { user_id, profile } = e.detail;
        setActiveChat((prev: any) => {
            if (!prev) return prev;
            // Check if this user is in the current chat
            const isParticipant = prev.participants.some((p: any) => p.id === user_id);
            if (isParticipant) {
                const updatedParticipants = prev.participants.map((p: any) => 
                    p.id === user_id ? { ...p, profile } : p
                );
                return { ...prev, participants: updatedParticipants };
            }
            return prev;
        });
    };
    
    // Listen for group updates (name change, member add/remove, admin change)
    const handleGroupUpdate = (e: any) => {
        const data = e.detail;
        
        // Only update if it affects the active chat
        if (activeChat && activeChat.id === data.conversation_id) {
            const token = localStorage.getItem("access_token");
            if (token) {
                 api.get(`/conversations/${activeChat.id}/`)
                 .then(res => {
                     console.log("Refreshed Active Chat:", res.data);
                     setActiveChat(res.data);
                 })
                 .catch(err => console.error("Failed to refresh chat:", err));
            }
        }
    };

    window.addEventListener("profile_updated", handleProfileUpdate);
    window.addEventListener("group_updated", handleGroupUpdate);

    return () => {
        if ((ws as any).heartbeatInterval) {
            clearInterval((ws as any).heartbeatInterval);
        }
        ws.close();
        window.removeEventListener("profile_updated", handleProfileUpdate);
        window.removeEventListener("group_updated", handleGroupUpdate);
    };
  }, [myUserId, activeChat]); // Added activeChat dep so handleGroupUpdate accesses current state

  return (
    <div className="flex h-screen bg-black">
      <Sidebar 
        onSelectChat={(chat: any) => setActiveChat(chat)} 
        selectedChatId={activeChat?.id} 
        onlineUsers={onlineUsers}
        myUserId={myUserId}  // Pass myUserId to Sidebar
      />
      <ChatArea 
        chat={activeChat} 
        onlineUsers={onlineUsers} 
        myUserId={myUserId}
      />
    </div>
  );
}