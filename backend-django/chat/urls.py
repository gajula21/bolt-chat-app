from django.urls import path
from .views import (
    ConversationListView, MessageListView, SendMessageView, 
    UserSearchView, UpdateProfileView, MyProfileView, MarkReadView,
    UpdateMessageView, DeleteMessageView, SendRequestView, 
    RespondRequestView, PendingRequestsView, GroupActionView, UpdateGroupView, RegisterView,
    PromoteAdminView, RemoveMemberView, ConversationDetailView, LogoutView
)

urlpatterns = [
    # User Management and Authentication
    path('register/', RegisterView.as_view(), name='register'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('users/me/', MyProfileView.as_view(), name='my-profile'),
    path('users/profile/update/', UpdateProfileView.as_view(), name='update-profile'),
    path('users/search/', UserSearchView.as_view(), name='user-search'),
    
    # Conversation and Messaging
    path('conversations/', ConversationListView.as_view(), name='conversations'),
    path('conversations/<int:conversation_id>/', ConversationDetailView.as_view(), name='conversation-detail'),
    path('conversations/<int:conversation_id>/messages/', MessageListView.as_view(), name='chat-history'),
    path('conversations/<int:conversation_id>/send/', SendMessageView.as_view(), name='send-message'),
    
    # Group Admin Specific
    path('conversations/<int:conversation_id>/promote/', PromoteAdminView.as_view(), name='group-promote'),
    path('conversations/<int:conversation_id>/remove/', RemoveMemberView.as_view(), name='group-remove'),
    path('conversations/<int:conversation_id>/messages/<int:message_id>/edit/', UpdateMessageView.as_view(), name='update-message'),
    path('conversations/<int:conversation_id>/messages/<int:message_id>/delete/', DeleteMessageView.as_view(), name='delete-message'),
    path('conversations/<int:conversation_id>/read/', MarkReadView.as_view(), name='mark-read'),
    
    # Group Management
    path('conversations/<int:conversation_id>/action/', GroupActionView.as_view(), name='group-action'),
    path('conversations/<int:conversation_id>/update/', UpdateGroupView.as_view(), name='group-update'),

    # Connection Requests
    path('users/request/send/', SendRequestView.as_view(), name='send-request'),
    path('users/request/respond/<int:request_id>/', RespondRequestView.as_view(), name='respond-request'),
    path('users/requests/pending/', PendingRequestsView.as_view(), name='pending-requests'),
]