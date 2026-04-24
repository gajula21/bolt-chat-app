"use client";
import { useEffect, useState, useRef } from "react";
import { cn, getInitials, getColor, formatDateLabel } from "@/lib/utils";
import axios from "axios";
import api from "@/lib/axios";
import { Send, Paperclip, MoreVertical, Smile, Reply, X, Edit2 } from "lucide-react";
import MessageBubble from "./MessageBubble";
import EmojiPicker, { Theme } from "emoji-picker-react";
import GroupDetailsModal from "./GroupDetailsModal";
import UserDetailsModal from "./UserDetailsModal";
import ForwardSelectionModal from "./ForwardSelectionModal";
import TypingIndicator from "./TypingIndicator";
import Lightbox from "./Lightbox";

interface Message {
  id: number;
  content: string;
  sender: { 
    username: string;
    profile?: {
      avatar: string | null;
    };
  };
  created_at: string;
  read_by: number[]; // Array of user IDs who read this
  is_deleted?: boolean;
}

interface ChatAreaProps {
  chat: any; // The full chat object
  onlineUsers: Set<number>; // Global online users from parent
  myUserId: number | null;
}

export default function ChatArea({ chat, onlineUsers, myUserId }: ChatAreaProps) {
  const [isGroupDetailsOpen, setIsGroupDetailsOpen] = useState(false);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: number; sender: string; content: string } | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: number; content: string } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set()); // Names of user typing
  const [myUsername, setMyUsername] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  
  // NOTE: myUserId is now passed as prop
  // const [myUserId, setMyUserId] = useState<number | null>(null); 

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages, typingUsers]);

  // Fetch Username only (if needed, or pass it too. optimizing to just fetch username for now or derive)
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token && !myUsername) {
        api.get("/users/me/")
        .then(res => {
            setMyUsername(res.data.username);
        })
        .catch(err => console.error("Identity Error:", err));
    }
  }, [myUsername]);



  // Mark Messages as Read
  const markAsRead = async () => {
    if (!chat || !myUserId) return;
    const token = localStorage.getItem("access_token");
    try {
      await api.post(`/conversations/${chat.id}/read/`, {});
    } catch (err) {
      console.error("Mark Read Error:", err);
    }
  };

  // Fetch Messages & Connect to Message Socket
  useEffect(() => {
    if (!chat || !myUserId) return;
    
    const token = localStorage.getItem("access_token");
    setMessages([]); // Clear previous chat
    setReplyingTo(null); // Clear reply state
    setEditingMessage(null); // Clear edit state
    setInputText(""); // Optional: Clear input text on chat switch

    const controller = new AbortController();
    
    // Fetch History
    api.get(`/conversations/${chat.id}/messages/`, {
        signal: controller.signal
    })
    .then(res => {
      // Backend returns paginated response: { count, next, previous, results }
      const fetchedMessages = res.data.results || res.data;
      setMessages(fetchedMessages.filter((m: any) => !m._hidden));
      // Mark as read immediately when opening chat
      markAsRead();
    })
    .catch(err => {
        if (axios.isCancel(err)) return;
        console.error("History Error:", err);
    });

    // Connect Message Socket
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000;

    const connectChatWs = () => {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001/ws";
        ws = new WebSocket(`${wsUrl}/${chat.id}/${myUserId}/?token=${token}`);
        wsRef.current = ws;
        
        ws.onopen = () => {
            console.log("Connected to Chat WS");
            reconnectAttempts = 0;
        };
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // CASE 1: New Message Received
            if (data.content) {
                if (data._hidden) return; // Ignore hidden
                setMessages(prev => {
                    if (prev.some(m => m.id === data.id)) return prev;
                    return [...prev, data];
                });
                setTypingUsers(prev => {
                    const next = new Set(prev);
                    next.delete(data.sender.username);
                    return next;
                });
                if (data.sender.username !== myUsername) {
                  markAsRead();
                }
            }
            
            // CASE 2: Read Receipt Received
            if (data.type === "read_receipt") {
                const readerId = data.user_id;
                setMessages(prev => prev.map(msg => {
                    if (!msg.read_by) msg.read_by = [];
                    if (msg.id <= data.last_message_id && !msg.read_by.includes(readerId)) {
                         return { ...msg, read_by: [...msg.read_by, readerId] };
                    }
                    return msg;
                }));
            }

            // CASE 3: Message Update (Edit)
            if (data.type === "message_update") {
                 setMessages(prev => prev.map(msg => 
                    msg.id === data.message.id ? data.message : msg
                 ));
            }

            // CASE 4: Typing Indicator
            if (data.type === "typing") {
                if (data.user_id !== myUserId) {
                    setTypingUsers(prev => {
                        const next = new Set(prev);
                        if (data.is_typing) {
                            next.add(data.username);
                        } else {
                            next.delete(data.username);
                        }
                        return next;
                    });
                }
            }

            // CASE 5: Message Deleted
            if (data.type === "message_delete") {
                setMessages(prev => prev.map(msg => 
                    msg.id === data.message_id 
                    ? { ...msg, content: "This message was deleted", is_deleted: true } 
                    : msg
                ));
            }
        };
        ws.onclose = () => {
            console.log("Disconnected Chat WS");
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
            reconnectTimeout = setTimeout(connectChatWs, delay);
            reconnectAttempts++;
        };
    };

    connectChatWs();

    return () => {
        controller.abort();
        clearTimeout(reconnectTimeout);
        if (ws) {
            ws.onclose = null; // Prevent reconnect on unmount
            ws.close();
        }
        wsRef.current = null;
    };
  }, [chat, myUserId, myUsername]); // Added myUsername dep to ensure markAsRead check works

  // Reply & Edit Handlers
  const handleReply = (id: number, sender: string, content: string) => {
    setReplyingTo({ id, sender, content });
    setEditingMessage(null); // Clear edit mode if active
    // Optionally focus input here
  };

  const handleEdit = (id: number, content: string) => {
    // Check if message is within 5 minutes (Optional frontend check, backend should validate too)
    // For now, just enable edit
    setEditingMessage({ id, content });
    setReplyingTo(null); // Clear reply mode if active
    setInputText(content);
  };

  const handleDelete = async (id: number, type: "me" | "everyone") => {
      const token = localStorage.getItem("access_token");
      try {
          await api.delete(`/conversations/${chat.id}/messages/${id}/delete/`, {
              data: { delete_type: type }
          });
          
          // Optimistic update for "Delete for Me" (WS handles "Delete for Everyone")
          if (type === "me") {
              setMessages(prev => prev.filter(msg => msg.id !== id));
          }
      } catch (error) {
          console.error("Delete Error:", error);
          alert("Failed to delete message");
      }
  };

  const handleForward = (message: Message) => {
      setForwardingMessage(message);
      setReplyingTo(null);
      setEditingMessage(null);
  };

  // Send Message
  const sendMessage = async () => {
    if (!inputText.trim() || !chat) return;

    const token = localStorage.getItem("access_token");
    let content = inputText;
    
    // Handle Editing (Phase 3)
    if (editingMessage) {
        try {
            await api.put(`/conversations/${chat.id}/messages/${editingMessage.id}/edit/`,
                { content }
            );
            // We rely on WS to update the UI
            setEditingMessage(null);
            setInputText("");
        } catch (error) {
            console.error("Edit Error:", error);
            alert("Failed to edit message");
        }
        return; 
    }

    // Handle Reply (Prepend Blockquote)
    if (replyingTo) {
        const quote = `> **${replyingTo.sender}**: ${replyingTo.content.split('\n')[0].substring(0, 50)}...\n\n`;
        content = quote + content;
        setReplyingTo(null);
    }
    
    setInputText(""); // Clear input immediately

    try {
      await api.post(`/conversations/${chat.id}/send/`,
        { content }
      );
    } catch (error) {
      console.error("Send Error:", error);
    }
  };

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black text-gray-500">
        <div className="mb-4">
          <img src="/assets/bolt-logo.png" alt="Logo" className="w-24 h-24 object-contain" />
        </div>
        <h3 className="text-xl font-semibold text-gray-300">Your Messages</h3>
        <p className="text-sm">Select a chat to start messaging</p>
      </div>
    );
  }

  // Calculate Other User (for DM Logic)
  const otherUser = chat.is_group 
      ? null 
      : chat.participants?.find((p: any) => p.id !== myUserId);

  const chatName = chat.is_group ? chat.name : otherUser?.username || "Unknown";
  
  if (!chat.is_group) {
      console.log(`[ChatArea] Header OtherUser:`, otherUser);
      console.log(`[ChatArea] MyUserId:`, myUserId);
      console.log(`[ChatArea] Avatar URL:`, otherUser?.profile?.avatar);
  }
  
  // Calculate Subtitle
  let subtitle;
  if (chat.is_group) {
      // Alphabetical Member List
      const names = chat.participants
          ?.map((p: any) => p.username)
          .sort((a: string, b: string) => a.localeCompare(b))
          .join(", ") || "";
      subtitle = <span className="text-xs text-[#71767B] truncate w-full block">{names}</span>;
  } else {
      // Online Status from Global State
      const isOnline = otherUser && onlineUsers.has(otherUser.id);
      subtitle = (
        <span className={`text-xs flex items-center gap-1 ${isOnline ? "text-[#00BA7C]" : "text-[#71767B]"}`}>
          {isOnline ? "Online" : "Offline"}
        </span>
      );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Send "Start Typing"
    wsRef.current.send(JSON.stringify({ type: "typing", is_typing: true, username: myUsername }));

    // Clear existing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Set timeout to "Stop Typing" after 2 seconds
    typingTimeoutRef.current = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "typing", is_typing: false, username: myUsername }));
        }
    }, 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-black h-screen">
      {/* Header */}
      <div 
        className="h-[53px] px-4 border-b border-[#2F3336] flex justify-between items-center bg-black/80 backdrop-blur-md sticky top-0 z-10 w-full cursor-pointer hover:bg-[#16181C]/50 transition"
        onClick={() => {
            if (chat.is_group) {
                setIsGroupDetailsOpen(true);
            } else {
                setIsUserDetailsOpen(true);
            }
        }}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div 
              className="w-8 h-8 rounded-full bg-[#EFF3F4] flex items-center justify-center text-black font-bold text-sm flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition"
              onClick={(e) => {
                  e.stopPropagation();
                  const url = chat.is_group && chat.avatar
                      ? (chat.avatar.startsWith("http") ? chat.avatar : `http://localhost:8000${chat.avatar}`)
                      : (!chat.is_group && otherUser?.profile?.avatar
                          ? (otherUser.profile.avatar.startsWith("http") ? otherUser.profile.avatar : `http://localhost:8000${otherUser.profile.avatar}`)
                          : null);
                  if (url) setViewingImage(url);
              }}
          >
            {chat.is_group && chat.avatar ? (
                <img 
                  src={chat.avatar.startsWith("http") ? chat.avatar : `http://localhost:8000${chat.avatar}`}
                  alt={chatName} 
                  className="w-full h-full object-cover"
                />
            ) : (!chat.is_group && otherUser?.profile?.avatar ? (
                <img 
                  src={otherUser.profile.avatar.startsWith("http") ? otherUser.profile.avatar : `http://localhost:8000${otherUser.profile.avatar}`}
                  alt={chatName} 
                  className="w-full h-full object-cover"
                />
            ) : (
                chatName.slice(0, 2).toUpperCase()
            ))}
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <h2 className="font-bold text-[#E7E9EA] text-[17px] truncate leading-5">{chatName}</h2>
            {subtitle}
          </div>
        </div>
        <button className="text-[#EFF3F4] hover:bg-[#EFF3F4]/10 p-2 rounded-full transition">
          <MoreVertical size={20} />
        </button>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-[#2F3336] scrollbar-track-transparent">
        {messages.map((msg, index) => {
           const isMe = msg.sender.username === myUsername;
           const avatarUrl = msg.sender.profile?.avatar;
           
           // Read Status Calculation
           let isRead = false;
           if (msg.read_by && msg.read_by.length > 0) {
               if (!chat.is_group && otherUser) {
                   isRead = msg.read_by.includes(otherUser.id);
               } else {
                   isRead = msg.read_by.some(id => id !== myUserId);
               }
           }

           // Format Time
           const dateObj = new Date(msg.created_at);
           const time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
           const dateLabel = formatDateLabel(msg.created_at);

           // Check if we need a date header
           const prevMsg = messages[index - 1];
           const prevDateLabel = prevMsg ? formatDateLabel(prevMsg.created_at) : null;
           const showDateHeader = dateLabel !== prevDateLabel;

             return (
             <div key={msg.id} className="flex flex-col w-full">
               {showDateHeader && (
                 <div className="flex justify-center my-4">
                   <span className="bg-[#2F3336] text-[#71767B] text-xs px-3 py-1 rounded-full font-medium">
                     {dateLabel}
                   </span>
                 </div>
               )}
               <MessageBubble 
                 id={msg.id} 
                 content={msg.content} 
                 sender={msg.sender.username} 
                 avatarUrl={avatarUrl}
                 isMe={isMe} 
                 isRead={isRead}
                 timestamp={time}
                 createdAt={msg.created_at}
                 onReply={handleReply}
                 onEdit={handleEdit}
                 onDelete={handleDelete}
                 onForward={() => handleForward(msg)}
                 onAvatarClick={(url) => setViewingImage(url.startsWith("http") ? url : `http://localhost:8000${url}`)}
               />
             </div>
           );
        })}
        {/* Typing Indicator in Flow */}
        <div className="pb-2 pl-4">
             <TypingIndicator usernames={Array.from(typingUsers)} />
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-black border-t border-[#2F3336]">
        {/* Reply Preview */}
        {replyingTo && (
            <div className="flex items-center justify-between bg-[#2F3336] p-2 rounded-t-lg text-sm text-[#71767B] mb-2 border-l-4 border-white">
                <div>
                    <span className="font-bold text-[#E7E9EA] mr-2">Replying to {replyingTo.sender}</span>
                    <p className="truncate max-w-xs">{replyingTo.content}</p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-[#E7E9EA] hover:bg-white/10 p-1 rounded-full">
                    <X size={16} />
                </button>
            </div>
        )}

        {/* Edit Preview */}
        {editingMessage && (
            <div className="flex items-center justify-between bg-[#2F3336] p-2 rounded-t-lg text-sm text-[#71767B] mb-2 border-l-4 border-[#00BA7C]">
                <div>
                    <span className="font-bold text-[#E7E9EA] mr-2">Editing Message</span>
                </div>
                <button onClick={() => {
                    setEditingMessage(null); 
                    setInputText("");
                }} className="text-[#E7E9EA] hover:bg-white/10 p-1 rounded-full">
                    <X size={16} />
                </button>
            </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
            <div className="absolute bottom-16 right-8 z-20 shadow-2xl rounded-2xl overflow-hidden animate-in slide-in-from-bottom-2">
                <EmojiPicker 
                    theme={Theme.DARK}
                    onEmojiClick={(emojiData) => setInputText(prev => prev + emojiData.emoji)}
                />
            </div>
        )}

        <div className="flex items-center gap-2 bg-[#202327] px-4 py-2 rounded-[24px] border border-transparent focus-within:bg-black focus-within:border-[#EFF3F4] transition-all relative">

          
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Start a new message"
            className="flex-1 bg-transparent text-[#E7E9EA] placeholder-[#71767B] focus:outline-none px-2 text-[15px]"
          />

          <button 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`p-1 hover:bg-[#EFF3F4]/10 rounded-full transition ${showEmojiPicker ? 'text-white' : 'text-[#EFF3F4]'}`}
          >
            <Smile size={20} />
          </button>
          
          <button 
            onClick={sendMessage}
            disabled={!inputText.trim()}
            className="p-1.5 text-[#EFF3F4] hover:bg-[#EFF3F4]/10 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition ml-1"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
      
      <GroupDetailsModal
        isOpen={isGroupDetailsOpen}
        onClose={() => setIsGroupDetailsOpen(false)}
        chat={chat}
        myUserId={myUserId}
        onUpdate={() => {
             console.log("Group Updated");
        }}
      />
      
      {otherUser && (
          <UserDetailsModal
            isOpen={isUserDetailsOpen}
            onClose={() => setIsUserDetailsOpen(false)}
            user={otherUser}
          />
      )}

      <ForwardSelectionModal
        isOpen={!!forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        messageContent={forwardingMessage?.content || null}
        onForward={() => {
            // Optional: Show success toast or scroll to bottom
            console.log("Message Forwarded");
        }}
        myUserId={myUserId}
      />
      
      {/* Lightbox */}
      {viewingImage && (
          <Lightbox 
              src={viewingImage} 
              onClose={() => setViewingImage(null)} 
          />
      )}
    </div>
  );
}