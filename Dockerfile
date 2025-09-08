# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# Install only production dependencies to keep the final image small
COPY package*.json ./
RUN npm ci

# Copy all JavaScript files from the root directory.
# This ensures that the db.json file is not baked into the image.
COPY *.js ./

# Stage 2: Create the final, minimal image
FROM node:22-alpine

ENV TZ="America/Los_Angeles"

WORKDIR /app

# Only copy the essential production files from the builder stage.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/*.js ./

EXPOSE 8008

CMD ["node", "server.js"]