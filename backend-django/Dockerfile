# Use python 3.11 lightweight version
FROM python:3.11-slim

# Set work directory inside the container
WORKDIR /app

# Install system tools needed for the Postgres connection
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install python libraries
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .