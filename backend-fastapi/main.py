import json
import redis.asyncio as redis
import asyncio
import os
import jwt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.websockets import WebSocketState

app = FastAPI()

redis_host = os.getenv('REDIS_HOST', 'localhost')
redis_client = redis.Redis(host=redis_host, port=6379, db=0, decode_responses=True)

# The Django SECRET_KEY — must match settings.py
# In production, set DJANGO_SECRET_KEY env var in docker-compose.
DJANGO_SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-DEV-ONLY-change-before-any-deployment')
JWT_ALGORITHM = "HS256"


def verify_token(token: str) -> int | None:
    """
    Verify a Django SimpleJWT access token.
    Returns the user_id if valid, None otherwise.
    """
    try:
        payload = jwt.decode(token, DJANGO_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        # SimpleJWT stores user_id in payload['user_id']
        user_id = payload.get("user_id")
        token_type = payload.get("token_type", "")
        if token_type != "access":
            return None
        return int(user_id) if user_id else None
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, Exception):
        return None


# --- 1. Chat Manager (Handles Messages) ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, conversation_id: str):
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = []
        self.active_connections[conversation_id].append(websocket)

    def disconnect(self, websocket: WebSocket, conversation_id: str):
        if conversation_id in self.active_connections:
            sockets = self.active_connections[conversation_id]
            if websocket in sockets:
                sockets.remove(websocket)
            if not sockets:
                del self.active_connections[conversation_id]

    async def broadcast_message(self, conversation_id: str, message: dict):
        if conversation_id not in self.active_connections:
            return
        dead = []
        for connection in self.active_connections[conversation_id]:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_text(json.dumps(message))
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d, conversation_id)


chat_manager = ConnectionManager()


# --- 2. Notify Manager (Handles Global Online Status) ---
class NotifyManager:
    def __init__(self):
        # active_users: {user_id (int): [socket1, socket2]}
        self.active_users: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_users:
            self.active_users[user_id] = []
        self.active_users[user_id].append(websocket)

        # Mark Online in Redis (60s TTL, refreshed on ping)
        await redis_client.set(f"user_online_{user_id}", "true", ex=60)

        # Broadcast "I am Online" globally
        await self.broadcast_global_status(user_id, "online")

        # Tell new user who else is currently online
        online_keys = await redis_client.keys("user_online_*")
        for key in online_keys:
            try:
                online_uid = int(key.split("_")[-1])
                if online_uid != user_id and websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_text(json.dumps({
                        "type": "status_update", "user_id": online_uid, "status": "online"
                    }))
            except Exception:
                pass

    async def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_users:
            sockets = self.active_users[user_id]
            if websocket in sockets:
                sockets.remove(websocket)
            if not sockets:
                del self.active_users[user_id]
                await self.broadcast_global_status(user_id, "offline")
                await redis_client.delete(f"user_online_{user_id}")
                print(f"[DEBUG] User {user_id} disconnected and marked offline")

    async def broadcast_global_status(self, user_id: int, status: str):
        message = json.dumps({"type": "status_update", "user_id": user_id, "status": status})
        dead = []
        for uid, sockets in list(self.active_users.items()):
            for socket in list(sockets):
                try:
                    if socket.client_state == WebSocketState.CONNECTED:
                        await socket.send_text(message)
                    else:
                        dead.append((uid, socket))
                except Exception:
                    dead.append((uid, socket))
        for uid, socket in dead:
            if uid in self.active_users and socket in self.active_users[uid]:
                self.active_users[uid].remove(socket)

    async def broadcast_to_users(self, user_ids: list, message: dict):
        payload = json.dumps(message)
        for uid in user_ids:
            if uid in self.active_users:
                for socket in list(self.active_users[uid]):
                    try:
                        if socket.client_state == WebSocketState.CONNECTED:
                            await socket.send_text(payload)
                    except Exception:
                        pass


notify_manager = NotifyManager()


# --- Redis Listener (Bridge: Django → FastAPI) ---
async def redis_listener():
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("chat_messages")
    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            data = json.loads(message["data"])
            print(f"[DEBUG] Redis received: {data.get('type', 'new_message')}")

            if data.get("type") == "message_update":
                await chat_manager.broadcast_message(str(data["conversation_id"]), data)

            elif data.get("type") == "read_receipt":
                await chat_manager.broadcast_message(str(data["conversation_id"]), {
                    "type": "read_receipt",
                    "user_id": data["user_id"],
                    "last_message_id": data["last_message_id"]
                })

            elif data.get("type") == "message_delete":
                await chat_manager.broadcast_message(str(data["conversation_id"]), {
                    "type": "message_delete",
                    "message_id": data["message_id"]
                })

            elif data.get("type") == "group_update":
                await chat_manager.broadcast_message(str(data["conversation_id"]), data)
                if "participant_ids" in data:
                    await notify_manager.broadcast_to_users(data["participant_ids"], data)

            elif data.get("type") == "profile_update":
                # Broadcast to all connected users via notify channel
                profile_msg = json.dumps(data)
                for uid, sockets in list(notify_manager.active_users.items()):
                    for socket in list(sockets):
                        try:
                            if socket.client_state == WebSocketState.CONNECTED:
                                await socket.send_text(profile_msg)
                        except Exception:
                            pass

            elif "message" in data:
                # New chat message
                await chat_manager.broadcast_message(str(data["conversation_id"]), data["message"])

        except Exception as e:
            print(f"[ERROR] Redis Listener Error: {e}")


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(redis_listener())


# --- Endpoints ---

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "version": "v3-auth",
        "notify_users": len(notify_manager.active_users),
        "active_chats": len(chat_manager.active_connections)
    }


@app.websocket("/ws/notify/{user_id}/")
async def websocket_notify(
    websocket: WebSocket,
    user_id: str,
    token: str = Query(default="")
):
    """
    Global presence WebSocket. Requires a valid JWT access token as ?token=...
    The user_id in the path is cross-checked against the token payload.
    """
    authenticated_user_id = verify_token(token)

    if authenticated_user_id is None:
        await websocket.close(code=4001, reason="Unauthorized: invalid or missing token")
        return

    uid = int(user_id)
    if authenticated_user_id != uid:
        await websocket.close(code=4003, reason="Forbidden: token does not match user_id")
        return

    await notify_manager.connect(websocket, uid)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                # Refresh Redis TTL on heartbeat
                await redis_client.set(f"user_online_{uid}", "true", ex=60)
    except WebSocketDisconnect:
        await notify_manager.disconnect(websocket, uid)


@app.websocket("/ws/{conversation_id}/{user_id}/")
async def websocket_chat(
    websocket: WebSocket,
    conversation_id: str,
    user_id: str,
    token: str = Query(default="")
):
    """
    Per-conversation chat WebSocket. Requires a valid JWT access token as ?token=...
    """
    authenticated_user_id = verify_token(token)

    if authenticated_user_id is None:
        await websocket.close(code=4001, reason="Unauthorized: invalid or missing token")
        return

    uid = int(user_id)
    if authenticated_user_id != uid:
        await websocket.close(code=4003, reason="Forbidden: token does not match user_id")
        return

    await chat_manager.connect(websocket, conversation_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "typing":
                    await chat_manager.broadcast_message(conversation_id, {
                        "type": "typing",
                        "user_id": uid,
                        "is_typing": message.get("is_typing", False),
                        "username": message.get("username", "Someone")
                    })
            except Exception:
                pass
    except WebSocketDisconnect:
        chat_manager.disconnect(websocket, conversation_id)