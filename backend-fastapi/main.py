import json
import redis.asyncio as redis
import asyncio
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()
redis_host = os.getenv('REDIS_HOST', 'localhost')
redis_client = redis.Redis(host=redis_host, port=6379, db=0, decode_responses=True)

# --- 1. Chat Manager (Handles Messages) ---
class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, conversation_id: str, user_id: str):
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = []
        self.active_connections[conversation_id].append(websocket)

    def disconnect(self, websocket: WebSocket, conversation_id: str, user_id: str):
        if conversation_id in self.active_connections:
            if websocket in self.active_connections[conversation_id]:
                self.active_connections[conversation_id].remove(websocket)

    async def broadcast_message(self, conversation_id: str, message: dict):
        if conversation_id in self.active_connections:
            for connection in self.active_connections[conversation_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    pass

chat_manager = ConnectionManager()

# --- 2. Notify Manager (Handles Global Online Status) ---
class NotifyManager:
    def __init__(self):
        # active_users: {user_id: [socket1, socket2]}
        self.active_users = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_users:
            self.active_users[user_id] = []
        self.active_users[user_id].append(websocket)
        
        # Mark Online
        await redis_client.set(f"user_online_{user_id}", "true", ex=60)
        
        # Broadcast "I am Online" to EVERYONE connected (Simple Lobby approach)
        await self.broadcast_global_status(user_id, "online")
        
        # Tell the NEW user who else is online right now
        online_keys = await redis_client.keys("user_online_*")
        for key in online_keys:
            online_uid = int(key.split("_")[-1])
            if online_uid != user_id:
                await websocket.send_text(json.dumps({
                    "type": "status_update", "user_id": online_uid, "status": "online"
                }))

    async def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_users:
            if websocket in self.active_users[user_id]:
                self.active_users[user_id].remove(websocket)
            if not self.active_users[user_id]:
                del self.active_users[user_id]
                # Broadcast Offline IMMEDIATELY
                await self.broadcast_global_status(user_id, "offline")
                # Remove from Redis
                await redis_client.delete(f"user_online_{user_id}")
                print(f"[DEBUG] User {user_id} disconnected and marked offline")

    async def broadcast_global_status(self, user_id: int, status: str):
        message = json.dumps({"type": "status_update", "user_id": user_id, "status": status})
        # Send to ALL connected users
        for uid in self.active_users:
            for socket in self.active_users[uid]:
                try:
                    await socket.send_text(message)
                except:
                    pass

    async def broadcast_to_users(self, user_ids: list, message: dict):
        payload = json.dumps(message)
        for uid in user_ids:
            if uid in self.active_users:
                for socket in self.active_users[uid]:
                    try:
                        await socket.send_text(payload)
                    except:
                        pass

notify_manager = NotifyManager()

# --- Redis Listener (Bridge) ---
async def redis_listener():
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("chat_messages")
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                print(f"[DEBUG] Redis received: {data}")
                
                # CASE 0: Message Update (Specific)
                if data.get("type") == "message_update":
                    print(f"[DEBUG] Broadcasting update to conversation {data['conversation_id']}")
                    await chat_manager.broadcast_message(str(data["conversation_id"]), data)

                # CASE 1: New Message
                elif "message" in data:
                    print(f"[DEBUG] Broadcasting message to conversation {data['conversation_id']}")
                    await chat_manager.broadcast_message(str(data["conversation_id"]), data["message"])
                
                # CASE 2: Read Receipt
                elif data.get("type") == "read_receipt":
                    print(f"[DEBUG] Broadcasting read_receipt to conversation {data['conversation_id']}")
                    await chat_manager.broadcast_message(str(data["conversation_id"]), {
                        "type": "read_receipt",
                        "user_id": data["user_id"],
                        "last_message_id": data["last_message_id"]
                    })
                
                # CASE 3: Message Delete
                elif data.get("type") == "message_delete":
                    print(f"[DEBUG] Broadcasting delete to conversation {data['conversation_id']}")
                    await chat_manager.broadcast_message(str(data["conversation_id"]), {
                        "type": "message_delete",
                        "message_id": data["message_id"]
                    })

                # CASE 4: Group Update
                elif data.get("type") == "group_update":
                    print(f"[DEBUG] Broadcasting group update to conversation {data['conversation_id']}")
                    # 1. Notify Chat Room (if open)
                    await chat_manager.broadcast_message(str(data["conversation_id"]), data)
                    
                    # 2. Notify Sidebar (Global)
                    if "participant_ids" in data:
                        await notify_manager.broadcast_to_users(data["participant_ids"], data)
            except Exception as e:
                print(f"[ERROR] Redis Listener Error: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(redis_listener())

# --- Endpoints ---

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "v2-notify", "notify_users": len(notify_manager.active_users)}

@app.websocket("/ws/notify/{user_id}/")
async def websocket_notify(websocket: WebSocket, user_id: str):
    uid = int(user_id)
    await notify_manager.connect(websocket, uid)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await redis_client.set(f"user_online_{uid}", "true", ex=60)
    except WebSocketDisconnect:
        await notify_manager.disconnect(websocket, uid)

@app.websocket("/ws/{conversation_id}/{user_id}/")
async def websocket_chat(websocket: WebSocket, conversation_id: str, user_id: str):
    await chat_manager.connect(websocket, conversation_id, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                # Handle Typing Indicators
                if message.get("type") == "typing":
                     await chat_manager.broadcast_message(conversation_id, {
                         "type": "typing",
                         "user_id": int(user_id),
                         "is_typing": message.get("is_typing", False),
                         "username": message.get("username", "Someone")
                     })
            except:
                pass
    except WebSocketDisconnect:
        chat_manager.disconnect(websocket, conversation_id, user_id)