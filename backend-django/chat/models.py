from django.db import models
from django.contrib.auth.models import User

class Conversation(models.Model):
    # If is_group is False, it's a DM between 2 people
    is_group = models.BooleanField(default=False)
    name = models.CharField(max_length=255, null=True, blank=True) # For group names
    participants = models.ManyToManyField(User, related_name="conversations")
    admins = models.ManyToManyField(User, related_name="administered_conversations", blank=True)
    avatar = models.ImageField(upload_to='group_avatars/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Conversation {self.id} ({'Group' if self.is_group else 'DM'})"

class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Track who has read the message (for blue ticks)
    read_by = models.ManyToManyField(User, related_name='read_messages', blank=True)
    
    # Deletion Fields
    is_deleted = models.BooleanField(default=False) # For "Delete for Everyone"
    deleted_by = models.ManyToManyField(User, related_name='deleted_messages', blank=True) # For "Delete for Me"

    def __str__(self):
        return f"Message {self.id} from {self.sender.username}"

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.CharField(max_length=100, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

class ConnectionRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
    )
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_requests')
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_requests')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('sender', 'receiver')

    def __str__(self):
        return f"{self.sender} -> {self.receiver} ({self.status})"