#!/bin/sh

# Start Xvfb
Xvfb :99 -screen 0 1280x720x24 &

# Set DISPLAY environment variable
export DISPLAY=:99

# Wait for Xvfb to be ready (optional, but can help with race conditions)
sleep 3

# Execute the main application command
exec npm start
