#!/bin/bash

# SecureChat Runner & Logger

echo "=================================================="
echo "    SecureChat Unified Development Runner         "
echo "=================================================="

# Check if client and server directories exist
if [ ! -d "client" ] || [ ! -d "server" ]; then
  echo "Error: Must run this script from the workspace root containing client and server directories."
  exit 1
fi

# Ensure logs are fresh
echo "Clearing previous log files..."
> client_log.txt
> server_log.txt

# Colorizer helper function
colorize() {
  local color="$1"
  local prefix="$2"
  local reset="\e[0m"
  while IFS= read -r line; do
    printf "${color}${prefix} | %s${reset}\n" "$line"
  done
}

echo "Running typechecks before starting servers..."

# 1. Type check client
echo "Type checking client..."
cd client
npx tsc --noEmit 2>&1 | tee -a ../client_log.txt | colorize "\e[1;33m" "[CLIENT]"
CLIENT_TSC=${PIPESTATUS[0]}
cd ..

# 2. Type check server
echo "Type checking server..."
cd server
npx tsc --noEmit 2>&1 | tee -a ../server_log.txt | colorize "\e[1;35m" "[SERVER]"
SERVER_TSC=${PIPESTATUS[0]}
cd ..

if [ $CLIENT_TSC -ne 0 ] || [ $SERVER_TSC -ne 0 ]; then
  echo "⚠️  WARNING: Type checking failed. Checking logs for compiler issues."
else
  echo "✅ Type checking passed successfully!"
fi

echo "Starting client and server processes..."

# Start server in the background and redirect output to server_log.txt (errors in purple to console)
echo "🚀 Starting Server (Port 4000)..."
cd server
npm run dev >> ../server_log.txt 2> >(tee -a ../server_log.txt | colorize "\e[1;35m" "[SERVER]" >&2) &
SERVER_PID=$!
cd ..

# Start client in the background and redirect output to client_log.txt (errors in yellow to console)
echo "🚀 Starting Client (Vite Dev Server)..."
cd client
npm run dev >> ../client_log.txt 2> >(tee -a ../client_log.txt | colorize "\e[1;33m" "[CLIENT]" >&2) &
CLIENT_PID=$!
cd ..

echo "--------------------------------------------------"
echo "Processes started successfully!"
echo "- Server PID: $SERVER_PID (Logging to server_log.txt)"
echo "- Client PID: $CLIENT_PID (Logging to client_log.txt)"
echo "--------------------------------------------------"
echo "Press Ctrl+C to terminate both processes and exit."
echo "--------------------------------------------------"

# Trap Ctrl+C (SIGINT) and kill background processes
cleanup() {
  echo ""
  echo "🧹 Terminating client and server processes..."
  kill $CLIENT_PID $SERVER_PID 2>/dev/null
  echo "✅ Processes terminated cleanly. Goodbye!"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Keep the script running to wait for background process signals
wait
