# Multi-stage lightweight Node.js container for CanaryGuard
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY app/package*.json ./
RUN npm ci --only=production

# Copy application source
COPY app/ ./

# Expose default HTTP port
EXPOSE 3000

# Default environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=v1 \
    FAILURE_RATE=0

# Use non-root user
USER node

CMD ["node", "server.js"]
