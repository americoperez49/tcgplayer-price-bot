# Use a Node.js base image with Debian (bullseye) for Puppeteer compatibility
FROM node:20-bullseye

# Set the working directory in the container
WORKDIR /app

# Install Chromium and its dependencies for Puppeteer
# These commands are based on Puppeteer's recommended setup for Debian-based systems
RUN apt-get update && apt-get install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libappindicator1 \
    libnss3 \
    libxkbcommon-x11-0 \
    fonts-liberation \
    xdg-utils \
    xvfb \
    chromium \
    dbus-x11 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application code (including prisma directory)
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the TypeScript application
RUN npm run build

# Expose the port the API server runs on
EXPOSE 3001

# Copy the entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set the entrypoint for the container
ENTRYPOINT ["docker-entrypoint.sh"]

# Command to run the application (passed as arguments to ENTRYPOINT)
CMD ["npm", "start"]
