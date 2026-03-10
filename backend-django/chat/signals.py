import json
import redis
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import Message
from .serializers import MessageSerializer

# Connect to Redis
r = redis.Redis.from_url(settings.REDIS_URL)

@receiver(post_save, sender=Message)
def send_message_to_socket(sender, instance, created, **kwargs):
    """
    Triggered whenever a Message is saved.
    """
    if created:
        # 1. Serialize the message data
        # We use the serializer to ensure the format matches the API
        serializer = MessageSerializer(instance)
        
        # 2. Publish to Redis
        channel_name = f"chat_{instance.conversation.id}"
        r.publish(channel_name, json.dumps(serializer.data))

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        from .models import UserProfile
        UserProfile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()