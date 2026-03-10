# Real-Time Chat Application

A full-stack, real-time chat application featuring 1-on-1 messaging, group chats, file/image uploads, and AI-powered PDF processing.

## 🚀 Tech Stack

*   **Frontend**: Next.js, React, Tailwind CSS, Axios, Emoji Picker React
*   **Main Backend (REST API)**: Django, Django REST Framework (DRF), SimpleJWT (Authentication)
*   **Real-Time Backend (WebSockets)**: FastAPI, Uvicorn
*   **Database**: PostgreSQL
*   **Message Broker & Cache**: Redis
*   **Containerization**: Docker & Docker Compose
*   **AI Integration**: Gemini API (for processing academic PDFs)

## ✨ Features

*   **Real-time Messaging**: Instant message delivery using WebSockets (FastAPI + Redis Pub/Sub).
*   **Group Chats**: Create groups, manage members, promote admins, and remove participants.
*   **Online/Offline Status**: Global real-time user presence indicators.
*   **Read Receipts & Typing Indicators**: See when messages are read and when someone is typing.
*   **Message Management**: Edit and delete messages.
*   **File & Image Sharing**: Upload and view images directly in the chat with a built-in image viewer.
*   **AI PDF Processing ("Deep Base")**: Upload academic PDFs and extract text, tables, and equations using the Gemini API.
*   **JWT Authentication**: Secure user registration and login.
*   **Emoji Support**: Integrated emoji picker for expressive messaging.

## 🛠️ Prerequisites

*   [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/)
*   [Node.js](https://nodejs.org/) (if running frontend locally outside Docker)
*   [Python 3.10+](https://www.python.org/) (if running backends locally outside Docker)

## 🐳 Quick Start (Docker)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/chat-app.git
    cd chat-app
    ```

2.  **Environment Variables:**
    Create a `.env` file in the root directory and configure necessary variables. Provide your database credentials and API keys. Example:
    ```env
    POSTGRES_DB=chat_db
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=yourpassword
    GEMINI_API_KEY=your_api_key_here
    REDIS_HOST=redis
    ```

3.  **Start the Backend Services:**
    The project uses Docker Compose to orchestrate backends and databases.
    ```bash
    docker-compose up --build -d
    ```
    This will start:
    *   PostgreSQL (port 5432)
    *   Redis (port 6379)
    *   Django Backend (port 8000)
    *   FastAPI WebSockets (port 8001)

4.  **Run Database Migrations (Django):**
    ```bash
    docker-compose exec django python manage.py migrate
    ```

5.  **Start the Frontend:**
    Open a new terminal window:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    The frontend will be available at `http://localhost:3000`.

## 📁 Project Structure

*   `/frontend` - Next.js application (Pages, Components, Tailwind config)
*   `/backend-django` - Main REST API handling auth, users, groups, messages history, and AI processing
*   `/backend-fastapi` - WebSocket server managing real-time connections, presence status, and live chat events
*   `docker-compose.yml` - Orchestrates the DB, Cache, and Backend services

## 📝 License

This project is licensed under the MIT License.
