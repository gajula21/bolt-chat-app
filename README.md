# 💬 Bolt Chat App

A high-performance, full-stack real-time chat application featuring 1-on-1 messaging, group chats, media uploads, and online/offline presence tracking. Built with a decoupled architecture utilizing a Django REST framework for the main API and a FastAPI service for handling high-throughput WebSockets.

---

## 🚀 Tech Stack

### Frontend
* **Framework**: Next.js 16 (App Router), React 19
* **Styling**: Tailwind CSS v4, Lucide React (Icons)
* **Data Fetching**: Axios
* **Utilities**: Date-fns (date formatting), Emoji Picker React, React Markdown

### Backend
* **Main API**: Django 5.0+, Django REST Framework (DRF)
* **Authentication**: SimpleJWT (JSON Web Tokens)
* **WebSocket Server**: FastAPI, Uvicorn, WebSockets
* **Image Processing**: Pillow

### Infrastructure & Databases
* **Database**: PostgreSQL 15
* **Message Broker & Cache**: Redis 7
* **Containerization**: Docker, Docker Compose
* **Server**: Gunicorn (for Django production)

---

## ✨ Key Features

* **Real-time Messaging**: Instant message delivery using WebSockets backed by FastAPI and Redis Pub/Sub.
* **1-on-1 & Group Chats**: Seamlessly create direct messages or manage group conversations (add/remove members, promote admins).
* **Live Presence**: Global real-time online/offline status indicators for all users.
* **Message Lifecycle**: Edit, delete, and forward messages. Includes read receipts and typing indicators.
* **Rich Media Support**: Upload avatars, share images in chats, and utilize an integrated image viewer. Emoji support is built-in.
* **Profile Management**: Customizable user profiles with avatar uploads and bio updates.
* **Robust Security**: JWT-based authentication securing both REST API endpoints and WebSocket connections.

---

## 📁 Project Structure

```text
chat-app/
│
├── frontend/             # Next.js Application
│   ├── app/              # Next.js App Router pages
│   ├── components/       # Reusable React components (ChatArea, Sidebar, Modals)
│   ├── lib/              # Utility functions and Axios instances
│   └── public/           # Static assets
│
├── backend-django/       # Main REST API (Auth, Users, Messages, Groups)
│   ├── chat/             # Django app for core chat logic
│   ├── config/           # Django project settings
│   └── media/            # User-uploaded files (avatars, images)
│
├── backend-fastapi/      # WebSocket Microservice
│   └── main.py           # FastAPI server for real-time events via Redis Pub/Sub
│
└── docker-compose.yml    # Orchestration for DB, Redis, Django, and FastAPI
```

---

## 🛠️ Prerequisites

* [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/) (Recommended)
* [Node.js](https://nodejs.org/) 20+ (If running frontend locally outside Docker)
* [Python](https://www.python.org/) 3.10+ (If running backends locally outside Docker)

---

## 🐳 Quick Start (Docker Setup)

The easiest way to run the entire stack is using Docker Compose.

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/chat-app.git
cd chat-app
```

### 2. Environment Variables
Create a `.env` file in the root directory and configure the following variables:
```env
# Database Credentials
POSTGRES_DB=chat_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password

# Redis Host
REDIS_HOST=redis
```

### 3. Start the Backend Services
Bring up the database, cache, and both backends:
```bash
docker-compose up --build -d
```
*   **PostgreSQL**: Port 5432
*   **Redis**: Port 6379
*   **Django Backend**: Port 8000
*   **FastAPI WebSockets**: Port 8001

### 4. Run Database Migrations
Initialize the database schema for the Django backend:
```bash
docker-compose exec django python manage.py migrate
```

### 5. Start the Frontend
In a new terminal window, navigate to the frontend directory and start the Next.js development server:
```bash
cd frontend
npm install
npm run dev
```
The frontend will be available at `http://localhost:3000`.

---

## 🔐 Architecture Notes

This project separates traditional HTTP requests from persistent WebSocket connections to achieve better scalability:
1. **Django** handles stateful data (Users, Auth, Message History) via REST API.
2. **FastAPI** handles the high-throughput, persistent WebSocket connections.
3. Both services communicate and stay synchronized using **Redis Pub/Sub**, ensuring that when a message is created via REST, or an event occurs via WebSocket, all connected clients receive real-time updates instantly.

---

## 📝 License
This project is licensed under the MIT License.
