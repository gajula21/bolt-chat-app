from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Conversation, Message, UserProfile

class UserProfileSerializer(serializers.ModelSerializer):
    avatar = serializers.ImageField(read_only=True)
    
    class Meta:
        model = UserProfile
        fields = ['avatar', 'bio']

class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'profile']

class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    is_deleted = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Message
        fields = ['id', 'conversation', 'sender', 'content', 'created_at', 'read_by', 'is_deleted']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        
        # "Delete for Everyone" — replace content but keep object
        if instance.is_deleted:
            data['content'] = "This message was deleted"
            data['is_deleted'] = True
            
        # "Delete for Me" — mark as hidden so frontend can filter it out
        # Queryset-level filtering in MessageListView is the primary mechanism;
        # this is a safety net for future serializer reuse contexts.
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            if instance.deleted_by.filter(id=request.user.id).exists():
                data['_hidden'] = True
                
        return data

class ConversationSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True)
    admins = UserSerializer(many=True, read_only=True)
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'is_group', 'name', 'avatar', 'participants', 'admins', 'other_user', 'last_message']

    def get_last_message(self, obj):
        last_msg = obj.messages.filter(is_deleted=False).order_by('-created_at').first()
        if last_msg:
            return {
                "content": last_msg.content,
                "timestamp": last_msg.created_at
            }
        return None

    def get_other_user(self, obj):
        if obj.is_group:
            return None
            
        request = self.context.get('request')
        if request and request.user:
            other_participant = obj.participants.exclude(id=request.user.id).first()
            if other_participant:
                return {
                    "username": other_participant.username,
                    "id": other_participant.id
                }
        return None