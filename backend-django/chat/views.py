
import json
import redis
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Q
from django.contrib.auth.models import User
from .models import Conversation, Message, UserProfile, ConnectionRequest
from .serializers import ConversationSerializer, MessageSerializer, UserSerializer

# Connect to Redis
redis_client = redis.StrictRedis(host='redis', port=6379, db=0)

class RegisterView(APIView):
    permission_classes = [] # Allow anyone to register

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        email = request.data.get("email", "")

        if not username or not password:
            return Response({"error": "Username and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({"error": "Username already taken"}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(username=username, password=password, email=email)
        
        # Signal (create_user_profile) will automatically create UserProfile
        
        # Generate Tokens immediately for seamless login
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


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get conversations where the current user is a participant
        conversations = Conversation.objects.filter(participants=request.user)
        serializer = ConversationSerializer(conversations, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        # Case 1: Creating a Group
        if 'is_group' in request.data and request.data['is_group']:
            name = request.data.get('name', 'New Group')
            participant_ids = request.data.get('participant_ids', [])
            
            if not participant_ids:
                return Response({"error": "Groups need at least one other member"}, status=400)
            
            # Create the Group
            conversation = Conversation.objects.create(
                name=name,
                is_group=True
            )
            # Add You + All Selected Users
            conversation.participants.add(request.user)
            conversation.admins.add(request.user) # Creator is Admin
            
            # Robustly add participants
            users_to_add = User.objects.filter(id__in=participant_ids)
            conversation.participants.add(*users_to_add)
            
            conversation.save()
            serializer = ConversationSerializer(conversation, context={'request': request})
            return Response(serializer.data)

        # Case 2: Creating a DM (Existing Logic)
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({"error": "User ID required for DM"}, status=400)
        
        target_user = User.objects.get(id=user_id)
        
        # Check if DM exists
        existing = Conversation.objects.filter(
            is_group=False,
            participants=request.user
        ).filter(participants=target_user)
        
        if existing.exists():
            return Response(ConversationSerializer(existing.first(), context={'request': request}).data)
            
        # Create DM
        conversation = Conversation.objects.create(name=f"DM-{request.user.id}-{target_user.id}")
        conversation.participants.add(request.user, target_user)
        serializer = ConversationSerializer(conversation, context={'request': request})
        return Response(serializer.data)

class MessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        # 1. Check if conversation exists and user is allowed
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user not in conversation.participants.all():
            return Response(status=status.HTTP_403_FORBIDDEN)

        # 2. Get messages (Pagination would go here in a real app)
        messages = conversation.messages.order_by('created_at')
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data)

class SendMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        content = request.data.get("content")
        
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Security Check: Am I in this chat?
        if request.user not in conversation.participants.all():
            return Response(status=status.HTTP_403_FORBIDDEN)

        # --- THE CRITICAL PART (CQRS) ---
        
        # 1. Write to Postgres (Persistence)
        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            content=content
        )

        # 2. Serialize the data
        # We use the serializer so the format matches exactly what the GET request returns
        serializer = MessageSerializer(message)
        data = serializer.data

        # 3. Publish to Redis (Real-time Notification)
        # Publish to the "chat_messages" channel that FastAPI subscribes to
        redis_client.publish("chat_messages", json.dumps({
            "conversation_id": conversation_id,
            "message": data
        }))

        return Response(data, status=status.HTTP_201_CREATED)


class UserSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.GET.get('search', '') # e.g. /api/users/?search=ali
        
        if not query:
            return Response([])

        # Filter users by username (excluding yourself)
        users = User.objects.filter(
            username__icontains=query
        ).exclude(
            id=request.user.id
        )[:10] # Limit to 10 results

        serializer = UserSerializer(users, many=True)
        data = serializer.data
        
        # Add connection status to each user
        for user_data in data:
            target_user_id = user_data['id']
            
            # Check for existing Conversation
            has_chat = Conversation.objects.filter(
                is_group=False,
                participants=request.user
            ).filter(participants__id=target_user_id).exists()
            
            if has_chat:
                user_data['connection_status'] = 'connected'
                continue

            # Check for Connection Request
            conn_req = ConnectionRequest.objects.filter(
                (Q(sender=request.user) & Q(receiver__id=target_user_id)) |
                (Q(sender__id=target_user_id) & Q(receiver=request.user))
            ).first()
            
            if conn_req:
                if conn_req.status == 'accepted':
                    user_data['connection_status'] = 'connected'
                elif conn_req.status == 'pending':
                    user_data['connection_status'] = 'pending_sent' if conn_req.sender == request.user else 'pending_received'
                else:
                    user_data['connection_status'] = 'rejected' # Or 'none' to allow retrying
            else:
                user_data['connection_status'] = 'none'

        return Response(data)


class UpdateProfileView(APIView):
    permission_classes = [IsAuthenticated]
    
    def put(self, request):
        user = request.user
        # Lazy creation for existing users who don't have a profile yet
        profile, created = UserProfile.objects.get_or_create(user=user)
        
        # Update Bio
        if 'bio' in request.data:
            profile.bio = request.data['bio']
            
        # Update Avatar
        if 'avatar' in request.FILES:
            profile.avatar = request.FILES['avatar']
            
        profile.save()
        
        profile.save()
        
        # Return updated user data
        updated_data = UserSerializer(user).data
        
        # Broadcast Profile Update
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
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        # 1. Get Conversation
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=404)

        # 2. Find messages I haven't read yet
        unread_messages = conversation.messages.exclude(read_by=request.user)

        if unread_messages.exists():
            # Get the last ID *before* we mark them as read (because the exclude() filter will make them vanish from the queryset after update)
            last_message_id = unread_messages.last().id
            
            # 3. Mark them as read
            for msg in unread_messages:
                msg.read_by.add(request.user)
            
            # 4. Notify Socket (for Real-time Ticks)
            redis_client.publish("chat_messages", json.dumps({
                "conversation_id": conversation_id,
                "type": "read_receipt",
                "user_id": request.user.id,
                "last_message_id": last_message_id
            }))

        return Response({"status": "marked as read"})


from datetime import timedelta
from django.utils import timezone

class UpdateMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, conversation_id, message_id):
        content = request.data.get("content")
        
        try:
            message = Message.objects.get(id=message_id, conversation_id=conversation_id)
        except Message.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Security Check: Am I the sender?
        if message.sender != request.user:
            return Response(status=status.HTTP_403_FORBIDDEN)
            
        # Time Check: Within 5 minutes?
        if timezone.now() - message.created_at > timedelta(minutes=5):
             return Response({"error": "Edit time limit exceeded (5 minutes)"}, status=400)

        message.content = content
        message.save()

        # Serialize
        serializer = MessageSerializer(message)
        data = serializer.data
        
        # Publish Update to Redis (So clients can update UI in real-time)
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

        delete_type = request.data.get("delete_type") # "me" or "everyone"

        if delete_type == "me":
            message.deleted_by.add(request.user)
            return Response({"status": "deleted for me"})

        elif delete_type == "everyone":
            # Security: Only sender can delete for everyone
            if message.sender != request.user:
                return Response(status=status.HTTP_403_FORBIDDEN)
            
            # Time Check: Within 5 minutes?
            if timezone.now() - message.created_at > timedelta(minutes=5):
                 return Response({"error": "Delete for everyone time limit exceeded (5 minutes)"}, status=400)
            
            message.is_deleted = True
            message.save()
            
            # Notify via Redis
            redis_client.publish("chat_messages", json.dumps({
                "conversation_id": conversation_id,
                "type": "message_delete", # Special type for deletion
                "message_id": message.id,
                "is_deleted": True
            }))
            
            return Response({"status": "deleted for everyone"})

        return Response({"error": "Invalid delete type"}, status=400)

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

        # Check existing request
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
        action = request.data.get("action") # "accept" or "reject"
        
        try:
            conn_req = ConnectionRequest.objects.get(id=request_id, receiver=request.user, status='pending')
        except ConnectionRequest.DoesNotExist:
            return Response({"error": "Request not found or not for you"}, status=404)

        if action == "accept":
            conn_req.status = 'accepted'
            conn_req.save()
            
            # Create/Get DM Conversation
            conversation = Conversation.objects.create(name=f"DM-{conn_req.sender.id}-{conn_req.receiver.id}")
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
        # Requests received by me that are pending
        pending = ConnectionRequest.objects.filter(receiver=request.user, status='pending')
        
        # Serialize simply (or create a dedicated serializer)
        data = [{
            "id": req.id,
            "sender": UserSerializer(req.sender).data,
            "created_at": req.created_at
        } for req in pending]
        
        return Response(data)

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
            
            # Notify
            redis_client.publish("chat_messages", json.dumps({
                "conversation_id": conversation.id,
                "type": "group_update",
                "action": action,
                "user_id": request.user.id,
                "participant_ids": [u.id for u in conversation.participants.all()]
            }))
            return Response({"status": "left"})

        # For other actions, requester must be an admin
        if not conversation.admins.filter(id=request.user.id).exists():
            return Response({"error": "Only admins can perform this action"}, status=403)

        if action == "add_member" and target_user_id:
            target_user = User.objects.get(id=target_user_id)
            conversation.participants.add(target_user)
        
        elif not target_user_id and action != "update_details":
             return Response({"error": "Target user ID required"}, status=400)
             
        elif target_user_id:
            target_user = User.objects.get(id=target_user_id)
            
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
                if conversation.admins.filter(id=target_user.id).exists():
                    conversation.admins.remove(target_user)

        conversation.save()
        
        # Notify via Socket (Generic Update)
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

        # Only admins can update details
        if not conversation.admins.filter(id=request.user.id).exists():
            return Response({"error": "Only admins can update group details"}, status=403)

        name = request.data.get("name")
        if name:
            conversation.name = name
            
        if 'avatar' in request.FILES:
            conversation.avatar = request.FILES['avatar']

        conversation.save()
        
        # Notify
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
        
        # Notify
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
        
        # Notify
        redis_client.publish("chat_messages", json.dumps({
            "conversation_id": conversation.id,
            "type": "group_update",
            "action": "remove_member",
            "target_user_id": target_user.id,
            "participant_ids": [u.id for u in conversation.participants.all()]
        }))
        
        return Response({"status": "removed"})

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

from rest_framework_simplejwt.tokens import RefreshToken

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh_token")
            if not refresh_token:
                 return Response({"error": "Refresh token is required"}, status=status.HTTP_400_BAD_REQUEST)

            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response(status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response(status=status.HTTP_400_BAD_REQUEST)