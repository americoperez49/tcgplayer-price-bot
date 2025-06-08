# TCGPlayer Price Monitoring Discord Bot

## Project Description

A Discord bot designed to monitor prices of specific TCGPlayer items and send alerts when their prices drop below a user-defined threshold. It also maintains a historical record of price changes for each monitored URL.

## Features

- Add, list, update, and delete monitored items via Discord slash commands.
- Set a price threshold for each item to receive alerts.
- Tracks price history for each unique TCGPlayer URL.
- Ownership checks for managing items (server owner or item owner).
- Utilizes Puppeteer for web scraping TCGPlayer prices.
- Uses Prisma as an ORM with a PostgreSQL database backend.

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v18 or higher recommended)
- npm (Node Package Manager)
- Docker and Docker Compose (for the Supabase backend)
- Git

## Setup and Running the Project

### 1. Clone the Repository

```bash
git clone https://github.com/americoperez49/tcgplayer-price-bot.git
cd tcgplayer-price-bot
```

### 2. Install Dependencies

```bash

npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory of the project with the following variables:

```
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
CHANNEL_ID=YOUR_DISCORD_CHANNEL_ID
SERVER_ID=YOUR_DISCORD_SERVER_ID
POLLING_INTERVAL_MS=300000
CLIENT_ID=YOUR_DISCORD_CLIENT_ID
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
```

- `DISCORD_TOKEN`: Your Discord bot's unique token.

  1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
  2.  Select your application or create a new one.
  3.  Navigate to "Bot" under "Settings".
  4.  Click "Reset Token" (if needed) and copy the token. **Keep this token private!**
  5.  Ensure you enable the necessary [Privileged Gateway Intents](https://discord.com/developers/docs/topics/gateway#privileged-intents) (e.g., `PRESENCE_INTENT`, `SERVER_MEMBERS_INTENT`, `MESSAGE_CONTENT_INTENT`) as required by your bot's functionality.

- `CHANNEL_ID`: The ID of the Discord channel where the bot will send price alerts.

  1.  In Discord, go to "User Settings" > "App Settings" > "Advanced" and enable "Developer Mode".
  2.  Right-click on the desired channel in your Discord server.
  3.  Click "Copy ID".

- `SERVER_ID`: The ID of your Discord server (guild). This is used for deploying slash commands globally or to a specific guild.

  1.  Ensure "Developer Mode" is enabled (see `CHANNEL_ID` instructions).
  2.  Right-click on your server icon in Discord.
  3.  Click "Copy ID".

- `POLLING_INTERVAL_MS`: The interval (in milliseconds) at which the bot will check for price changes.

  - Default: `300000` (5 minutes). Adjust as needed.

- `CLIENT_ID`: Your Discord application's Client ID. This is needed for deploying global slash commands.

  1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
  2.  Select your application.
  3.  Under "General Information" > "General Information", copy the "Application ID".

- `DATABASE_URL`: The connection string for your PostgreSQL database.
  - For local development with Supabase, use the default value provided which you can get from [Accessing Postgres](https://supabase.com/docs/guides/self-hosting/docker#accessing-postgres). Make sure to use the session based connection.
  - Refer to the "Supabase Backend (Local with Docker)" section below for instructions on setting up your local database.

### 4. Supabase Backend (Local with Docker)

This project uses Supabase for its PostgreSQL database. You can run a local instance using Docker:

1.  **Start Supabase services:**

    ```bash
    # Get the code
    git clone --depth 1 https://github.com/supabase/supabase

    # Make your new supabase project directory
    mkdir supabase-project

    # Tree should look like this
    # .
    # ├── supabase
    # └── supabase-project

    # Copy the compose files over to your project
    cp -rf supabase/docker/* supabase-project

    # Copy the fake env vars
    cp supabase/docker/.env.example supabase-project/.env

    # Switch to your project directory
    cd supabase-project

    # Pull the latest images
    docker compose pull

    # Start the services (in detached mode)
    docker compose up -d
    ```

    This will start PostgreSQL, PostgREST, and other Supabase services. The database will be accessible at `localhost:5432`.

2.  **Verify Supabase status:**

    ```bash
    docker compose -f supabase/docker/docker-compose.yml ps
    ```

    Ensure all services are running. If the pooler service keeps restarting, you're probably encountering a SyntaxError due to unexpected carriage return characters (\r, Unicode code point U+000D) in your configuration file. (docker/volumes/pooler/pooler.exs).
    You need to save the file with LF line ending. Easy way is to use VSCode.

    In Visual Studio Code:
    Click on the line ending indicator in the bottom-right corner of the window (it might display "CRLF").
    Select "LF" to convert the file to Unix-style line endings.
    Save the file.

3.  **Run Prisma Migrations:**
    Once the Supabase database is running, apply the Prisma migrations to set up your database schema:
    ```bash
    cd ..
    npx prisma migrate dev
    ```
    You might be prompted to name the migration if there are new schema changes.

### 5. Build the Project

Compile the TypeScript code:

```bash
npm run build
```

### 6. Deploy Discord Commands

Register the slash commands with Discord. **You only need to run this command once, or whenever you add/modify slash commands.**

```bash
npm run deploy-commands
```

### 7. Run the Bot

Start the Discord bot:

```bash
npm start
```

The bot should now be online in your Discord server and start monitoring prices according to your configured items.

## Database Schema

The project uses Prisma with the following models:

```mermaid
erDiagram
    Url {
        String id PK
        String url UK "Unique URL"
        MonitoredItem[] monitoredItems
        PriceHistory[] priceHistory
    }

    MonitoredItem {
        String id PK
        String name
        Float threshold
        String discordUserId
        String urlId FK
        Url url
    }

    PriceHistory {
        String id PK
        String urlId FK
        Url url
        Float price
        DateTime timestamp
    }

    MonitoredItem ||--o{ Url : "references"
    Url ||--o{ PriceHistory : "has_history"
```

## Commands

- `/add-item <name> <url> <threshold>`: Adds a new item to monitor.
- `/list-items`: Lists all monitored items (or yours if not server owner).
- `/update-item`: Select an item to update its name, URL, or threshold.
- `/delete-item`: Select an item to delete.

## Building and Deploying with Docker

This project can be containerized using Docker for easier deployment.

### 1. Build the Docker Image

Ensure you are in the root directory of the project (`tcgplayer-price-bot`) where the `Dockerfile` is located.

```bash
docker build -t tcgplayer-price-bot .
```

This command builds a Docker image named `tcgplayer-price-bot` using the `Dockerfile` in the current directory.

### 2. Run the Docker Container

You can run the bot in a Docker container. Make sure your `.env` file is correctly configured as described in the "Environment Variables" section, especially the `DATABASE_URL` to point to your PostgreSQL instance (which can be another Docker container or a remote database).

If you are running Supabase locally with Docker Compose, ensure those services are up and running first.

```bash
docker run -d --name tcgplayer-bot --env-file ./.env tcgplayer-price-bot
```

- `-d`: Runs the container in detached mode (in the background).
- `--name tcgplayer-bot`: Assigns a name to your container for easy reference.
- `--env-file ./.env`: Mounts your local `.env` file into the container, making environment variables available to the application inside.
- `tcgplayer-price-bot`: The name of the Docker image to run.

### 3. Verify Container Status

Check if your container is running:

```bash
docker ps
```

You should see `tcgplayer-bot` listed.

### 4. View Container Logs (for troubleshooting)

To view the bot's output and check for errors:

```bash
docker logs tcgplayer-bot
```

To follow logs in real-time:

```bash
docker logs -f tcgplayer-bot
```

### 5. Stop and Remove the Container

To stop the running bot container:

```bash
docker stop tcgplayer-bot
```

To remove the container (after stopping it):

```bash
docker rm tcgplayer-bot
```

To remove the container (after stopping it):

```bash
docker rm tcgplayer-bot
```

## Troubleshooting

- If the bot doesn't come online, check your `DISCORD_TOKEN` and `CHANNEL_ID` in the `.env` file.
- Ensure your local Supabase services are running and Prisma migrations have been applied.
- For Puppeteer issues, ensure you have the necessary browser dependencies installed on your system if running without Docker, or that the Docker environment supports headless Chrome.
