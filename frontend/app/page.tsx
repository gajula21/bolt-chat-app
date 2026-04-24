"use client";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/axios";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";

interface HeartbeatWebSocket extends WebSocket {
    heartbeatInterval?: NodeJS.Timeout;
}

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

  // Use a ref for activeChat so event listeners inside the WebSocket effect
  // can access the latest state without triggering a reconnect.
  const activeChatRef = useRef(activeChat);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // 2. Global Presence WebSocket
  useEffect(() => {
    if (!myUserId) return;

    let ws: HeartbeatWebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000;

    const connectWs = () => {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001/ws";
        const socket = new WebSocket(`${wsUrl}/notify/${myUserId}/?token=${token}`) as HeartbeatWebSocket;
        ws = socket;

        socket.onopen = () => {
            console.log("Connected to Global Lobby");
            reconnectAttempts = 0; // reset
            // Send heartbeat every 30s
            const interval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) socket.send("ping");
            }, 30000);
            
            socket.heartbeatInterval = interval;
        };

        socket.onerror = (error) => {
            console.error("Global WebSocket error:", error);
        };

        socket.onmessage = (event) => {
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
                window.dispatchEvent(new CustomEvent("profile_updated", { detail: data }));
            }
            else if (data.type === "group_update") {
                console.log("Global Group Update Recvd:", data);
                window.dispatchEvent(new CustomEvent("group_updated", { detail: data }));
            }
        };

        socket.onclose = () => {
            console.log("Disconnected from Global Lobby");
            if (socket.heartbeatInterval) {
                clearInterval(socket.heartbeatInterval);
            }
            
            // Reconnect logic with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
            console.log(`Reconnecting Global WS in ${delay}ms...`);
            reconnectTimeout = setTimeout(connectWs, delay);
            reconnectAttempts++;
        };
    };

    connectWs();

    // Listen for profile updates to update activeChat
    const handleProfileUpdate = (e: any) => {
        const { user_id, profile } = e.detail;
        const currentActive = activeChatRef.current;
        if (!currentActive) return;

        // Check if this user is in the current chat
        const isParticipant = currentActive.participants.some((p: any) => p.id === user_id);
        if (isParticipant) {
            const updatedParticipants = currentActive.participants.map((p: any) => 
                p.id === user_id ? { ...p, profile } : p
            );
            setActiveChat({ ...currentActive, participants: updatedParticipants });
        }
    };
    
    // Listen for group updates (name change, member add/remove, admin change)
    const handleGroupUpdate = (e: any) => {
        const data = e.detail;
        const currentActive = activeChatRef.current;
        
        // Only update if it affects the active chat
        if (currentActive && currentActive.id === data.conversation_id) {
            const token = localStorage.getItem("access_token");
            if (token) {
                 api.get(`/conversations/${currentActive.id}/`)
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
        if (ws?.heartbeatInterval) {
            clearInterval(ws.heartbeatInterval);
        }
        clearTimeout(reconnectTimeout);
        if (ws) {
            ws.onclose = null; // Prevent reconnect loop on intentional unmount
            ws.close();
        }
        window.removeEventListener("profile_updated", handleProfileUpdate);
        window.removeEventListener("group_updated", handleGroupUpdate);
    };
  }, [myUserId]); // Removed activeChat from dependencies to prevent reconnects

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