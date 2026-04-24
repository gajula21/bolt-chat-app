import json
import redis
from datetime import timedelta
from django.conf import settings
from django.db.models import Q, Exists, OuterRef
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import LimitOffsetPagination
from rest_framework import status
from django.contrib.auth.models import User
from .models import Conversation, Message, UserProfile, ConnectionRequest
from .serializers import ConversationSerializer, MessageSerializer, UserSerializer

# Connect to Redis — use localhost when running outside Docker, 'redis' inside Docker
redis_client = redis.StrictRedis(host=settings.REDIS_HOST, port=6379, db=0)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class RegisterView(APIView):
    permission_classes = []

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")
        email = request.data.get("email", "")

        if not username or not password:
            return Response({"error": "Username and password are required"}, status=400)

        if len(password) < 6:
            return Response({"error": "Password must be at least 6 characters"}, status=400)

        if User.objects.filter(username=username).exists():
            return Response({"error": "Username already taken"}, status=400)

        user = User.objects.create_user(username=username, password=password, email=email)

        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)

        return Response({
            "status": "success",
            "user_id": user.id,
            "username": user.username,
            "tokens": {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            }
        }, status=status.HTTP_201_CREATED)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh_token = request.data.get("refresh_token")
            if not refresh_token:
                return Response({"error": "Refresh token is required"}, status=400)
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(status=status.HTTP_205_RESET_CONTENT)
        except Exception:
            return Response(status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = Conversation.objects.filter(participants=request.user).order_by('-id')
        serializer = ConversationSerializer(conversations, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        # Case 1: Creating a Group
        if request.data.get('is_group'):
            name = request.data.get('name', 'New Group').strip()
            participant_ids = request.data.get('participant_ids', [])

            if not participant_ids:
                return Response({"error": "Groups need at least one other member"}, status=400)

            conversation = Conversation.objects.create(name=name, is_group=True)
            conversation.participants.add(request.user)
            conversation.admins.add(request.user)

            users_to_add = User.objects.filter(id__in=participant_ids)
            conversation.participants.add(*users_to_add)
            conversation.save()

            serializer = ConversationSerializer(conversation, context={'request': request})
            return Response(serializer.data)

        # Case 2: Creating a DM
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({"error": "User ID required for DM"}, status=400)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # Prevent duplicate DM
        existing = Conversation.objects.filter(
            is_group=False, participants=request.user
        ).filter(participants=target_user)

        if existing.exists():
            return Response(ConversationSerializer(existing.first(), context={'request': request}).data)

        conversation = Conversation.objects.create(is_group=False)
        conversation.participants.add(request.user, target_user)
        serializer = ConversationSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user not in conversation.participants.all():
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = ConversationSerializer(conversation, context={'request': request})
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Messages  (with pagination + proper "deleted for me" filtering)
# ---------------------------------------------------------------------------

class MessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user not in conversation.participants.all():
            return Response(status=status.HTTP_403_FORBIDDEN)

        # Exclude messages deleted "for me" at queryset level
        messages = conversation.messages.exclude(
            deleted_by=request.user
        ).order_by('created_at').select_related('sender', 'sender__profile')

        # Pagination: ?limit=50&offset=0  (default 50 most recent)
        paginator = LimitOffsetPagination()
        paginator.default_limit = 50
        paginator.max_limit = 100

        page = paginator.paginate_queryset(messages, request)
        serializer = MessageSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


class SendMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        content = request.data.get("content", "").strip()

        # Validate content
        if not content:
            return Response({"error": "Message content cannot be empty"}, status=400)
        if len(content) > 10000:
            return Response({"error": "Message too long (max 10,000 characters)"}, status=400)

        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user not in conversation.participants.all():
            return Response(status=status.HTTP_403_FORBIDDEN)

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            content=content
        )

        serializer = MessageSerializer(message, context={'request': request})
        data = serializer.data

        # Publish to Redis → FastAPI broadcasts via WebSocket
        redis_client.publish("chat_messages", json.dumps({
            "conversation_id": conversation_id,
            "message": data
        }))

        return Response(data, status=status.HTTP_201_CREATED)


class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=404)

        unread_messages = conversation.messages.exclude(read_by=request.user)

        if unread_messages.exists():
            last_message_id = unread_messages.last().id
            for msg in unread_messages:
                msg.read_by.add(request.user)

            redis_client.publish("chat_messages", json.dumps({
                "conversation_id": conversation_id,
                "type": "read_receipt",
                "user_id": request.user.id,
                "last_message_id": last_message_id
            }))

        return Response({"status": "marked as read"})


class UpdateMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, conversation_id, message_id):
        content = request.data.get("content", "").strip()
        if not content:
            return Response({"error": "Content cannot be empty"}, status=400)

        try:
            message = Message.objects.get(id=message_id, conversation_id=conversation_id)
        except Message.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if message.sender != request.user:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if timezone.now() - message.created_at > timedelta(minutes=5):
            return Response({"error": "Edit time limit exceeded (5 minutes)"}, status=400)

        message.content = content
        message.save()

        serializer = MessageSerializer(message, context={'request': request})
        data = serializer.data

        redis_client.publish("chat_messages", json.dumps({
            "conversation_id": conversation_id,
            "type": "message_update",
            "message": data
        }))

        return Response(data)


class DeleteMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id, message_id):
        try:
            message = Message.objects.get(id=message_id, conversation_id=conversation_id)
        except Message.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        delete_type = request.data.get("delete_type")

        if delete_type == "me":
            message.deleted_by.add(request.user)
            return Response({"status": "deleted for me"})

        elif delete_type == "everyone":
            if message.sender != request.user:
                return Response(status=status.HTTP_403_FORBIDDEN)

            if timezone.now() - message.created_at > timedelta(minutes=5):
                return Response({"error": "Delete for everyone time limit exceeded (5 minutes)"}, status=400)

            message.is_deleted = True
            message.save()

            redis_client.publish("chat_messages", json.dumps({
                "conversation_id": conversation_id,
                "type": "message_delete",
                "message_id": message.id,
                "is_deleted": True
            }))

            return Response({"status": "deleted for everyone"})

        return Response({"error": "Invalid delete type"}, status=400)


# ---------------------------------------------------------------------------
# User / Profile
# ---------------------------------------------------------------------------

class UserSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.GET.get('search', '').strip()
        if not query:
            return Response([])

        users = User.objects.filter(
            username__icontains=query
        ).exclude(id=request.user.id).select_related('profile')[:10]

        serializer = UserSerializer(users, many=True)
        data = serializer.data

        # Bulk-annotate connection status to avoid N+1 queries
        target_ids = [u['id'] for u in data]

        # Conversations this user has (DMs only)
        dm_partner_ids = set(
            Conversation.objects.filter(
                is_group=False, participants=request.user
            ).filter(participants__id__in=target_ids)
            .values_list('participants__id', flat=True)
        ) - {request.user.id}

        # All connection requests between this user and the targets
        conn_reqs = ConnectionRequest.objects.filter(
            (Q(sender=request.user) & Q(receiver__id__in=target_ids)) |
            (Q(sender__id__in=target_ids) & Q(receiver=request.user))
        )
        req_map = {}
        for req in conn_reqs:
            other_id = req.receiver_id if req.sender_id == request.user.id else req.sender_id
            req_map[other_id] = req

        for user_data in data:
            uid = user_data['id']
            if uid in dm_partner_ids:
                user_data['connection_status'] = 'connected'
            elif uid in req_map:
                req = req_map[uid]
                if req.status == 'accepted':
                    user_data['connection_status'] = 'connected'
                elif req.status == 'pending':
                    user_data['connection_status'] = 'pending_sent' if req.sender_id == request.user.id else 'pending_received'
                else:
                    user_data['connection_status'] = 'rejected'
            else:
                user_data['connection_status'] = 'none'

        return Response(data)


class UpdateProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user = request.user
        profile, _ = UserProfile.objects.get_or_create(user=user)

        if 'bio' in request.data:
            profile.bio = request.data['bio'][:100]  # enforce max length

        if 'avatar' in request.FILES:
            profile.avatar = request.FILES['avatar']

        profile.save()  # single save (was doubled before)

        updated_data = UserSerializer(user, context={'request': request}).data

        # Broadcast profile update to all connected users
        redis_client.publish("chat_messages", json.dumps({
            "type": "profile_update",
            "user_id": user.id,
            "username": user.username,
            "profile": {
                "avatar": updated_data['profile']['avatar'],
                "bio": updated_data['profile']['bio']
            }
        }))

        return Response(updated_data)


class MyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Connection Requests
# ---------------------------------------------------------------------------

class SendRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        receiver_id = request.data.get("user_id")
        if not receiver_id:
            return Response({"error": "User ID required"}, status=400)

        try:
            receiver = User.objects.get(id=receiver_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        if receiver == request.user:
            return Response({"error": "Cannot send request to yourself"}, status=400)

        existing = ConnectionRequest.objects.filter(
            (Q(sender=request.user) & Q(receiver=receiver)) |
            (Q(sender=receiver) & Q(receiver=request.user))
        ).first()

        if existing:
            return Response({"status": existing.status, "message": "Request already exists"})

        ConnectionRequest.objects.create(sender=request.user, receiver=receiver)
        return Response({"status": "pending", "message": "Request sent"})


class RespondRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        action = request.data.get("action")

        try:
            conn_req = ConnectionRequest.objects.get(id=request_id, receiver=request.user, status='pending')
        except ConnectionRequest.DoesNotExist:
            return Response({"error": "Request not found or not for you"}, status=404)

        if action == "accept":
            conn_req.status = 'accepted'
            conn_req.save()

            # Get existing DM or create a new one (prevent duplicates)
            existing = Conversation.objects.filter(
                is_group=False, participants=conn_req.sender
            ).filter(participants=conn_req.receiver).first()

            if existing:
                conversation = existing
            else:
                conversation = Conversation.objects.create(is_group=False)
                conversation.participants.add(conn_req.sender, conn_req.receiver)

            return Response({"status": "accepted", "conversation_id": conversation.id})

        elif action == "reject":
            conn_req.status = 'rejected'
            conn_req.save()
            return Response({"status": "rejected"})

        return Response({"error": "Invalid action"}, status=400)


class PendingRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pending = ConnectionRequest.objects.filter(
            receiver=request.user, status='pending'
        ).select_related('sender', 'sender__profile')

        data = [{
            "id": req.id,
            "sender": UserSerializer(req.sender, context={'request': request}).data,
            "created_at": req.created_at
        } for req in pending]

        return Response(data)


# ---------------------------------------------------------------------------
# Group Actions
# ---------------------------------------------------------------------------

class GroupActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        action = request.data.get("action")
        target_user_id = request.data.get("user_id")

        try:
            conversation = Conversation.objects.get(id=conversation_id, is_group=True)
        except Conversation.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        if action == "leave":
            conversation.participants.remove(request.user)
            if conversation.admins.filter(id=request.user.id).exists():
                conversation.admins.remove(request.user)
            conversation.save()

            redis_client.publish("chat_messages", json.dumps({
                "conversation_id": conversation.id,
                "type": "group_update",
                "action": action,
                "user_id": request.user.id,
                "participant_ids": [u.id for u in conversation.participants.all()]
            }))
            return Response({"status": "left"})

        # All other actions require admin
        if not conversation.admins.filter(id=request.user.id).exists():
            return Response({"error": "Only admins can perform this action"}, status=403)

        if action == "add_member":
            # Support batch add: user_id (single) or user_ids (list)
            user_ids = request.data.get("user_ids", [])
            if target_user_id:
                user_ids = [target_user_id]
            if not user_ids:
                return Response({"error": "user_id or user_ids required"}, status=400)

            users = User.objects.filter(id__in=user_ids)
            conversation.participants.add(*users)

        elif target_user_id:
            try:
                target_user = User.objects.get(id=target_user_id)
            except User.DoesNotExist:
                return Response({"error": "User not found"}, status=404)

            if action == "remove_member":
                conversation.participants.remove(target_user)
                if conversation.admins.filter(id=target_user.id).exists():
                    conversation.admins.remove(target_user)
            elif action == "promote_admin":
                if target_user in conversation.participants.all():
                    conversation.admins.add(target_user)
                else:
                    return Response({"error": "User must be a member to be promoted"}, status=400)
            elif action == "dismiss_admin":
                conversation.admins.remove(target_user)
        else:
            return Response({"error": "Target user ID required"}, status=400)

        conversation.save()

        redis_client.publish("chat_messages", json.dumps({
            "conversation_id": conversation.id,
            "type": "group_update",
            "action": action,
            "target_user_id": target_user_id,
            "participant_ids": [u.id for u in conversation.participants.all()]
        }))

        return Response({"status": "success"})


class UpdateGroupView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id, is_group=True)
        except Conversation.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        if not conversation.admins.filter(id=request.user.id).exists():
            return Response({"error": "Only admins can update group details"}, status=403)

        name = request.data.get("name")
        if name:
            conversation.name = name.strip()

        if 'avatar' in request.FILES:
            conversation.avatar = request.FILES['avatar']

        conversation.save()

        broadcast_data = {
            "conversation_id": conversation.id,
            "type": "group_update",
            "action": "update_details",
            "name": conversation.name,
            "participant_ids": [u.id for u in conversation.participants.all()]
        }
        if conversation.avatar:
            broadcast_data["avatar"] = conversation.avatar.url

        redis_client.publish("chat_messages", json.dumps(broadcast_data))

        return Response(ConversationSerializer(conversation, context={'request': request}).data)


# PromoteAdminView and RemoveMemberView are kept for backwards URL compat
# but their logic is now handled in GroupActionView as well.

class PromoteAdminView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id, is_group=True)
        except Conversation.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        if not conversation.admins.filter(id=request.user.id).exists():
            return Response({"error": "Only admins can perform this action"}, status=403)

        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"error": "User ID required"}, status=400)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        if target_user not in conversation.participants.all():
            return Response({"error": "User must be a member to be promoted"}, status=400)

        conversation.admins.add(target_user)
        conversation.save()

        redis_client.publish("chat_messages", json.dumps({
            "conversation_id": conversation.id,
            "type": "group_update",
            "action": "promote_admin",
            "target_user_id": target_user.id,
            "participant_ids": [u.id for u in conversation.participants.all()]
        }))

        return Response({"status": "promoted"})


class RemoveMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id, is_group=True)
        except Conversation.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        if not conversation.admins.filter(id=request.user.id).exists():
            return Response({"error": "Only admins can perform this action"}, status=403)

        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"error": "User ID required"}, status=400)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        conversation.participants.remove(target_user)
        if conversation.admins.filter(id=target_user.id).exists():
            conversation.admins.remove(target_user)

        conversation.save()

        redis_client.publish("chat_messages", json.dumps({
            "conversation_id": conversation.id,
            "type": "group_update",
            "action": "remove_member",
            "target_user_id": target_user.id,
            "participant_ids": [u.id for u in conversation.participants.all()]
        }))

        return Response({"status": "removed"})