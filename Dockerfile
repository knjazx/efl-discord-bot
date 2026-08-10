FROM node:20-slim

# Install system dependencies required by @napi-rs/canvas and Prisma SQLite
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install Node.js dependencies
RUN npm ci

# Copy project files
COPY . .

# Generate Prisma Client and build TypeScript
RUN npx prisma generate
RUN npm run build

# Start production server
CMD ["node", "dist/index.js"]
