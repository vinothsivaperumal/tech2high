#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tech2high}"

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl git build-essential postgresql-client
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y curl git gcc-c++ make postgresql
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo dnf install -y nodejs
else
  echo "Unsupported Linux distribution. Install Node.js 20, git, and psql manually."
  exit 1
fi

sudo npm install -g pm2
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

node -v
npm -v
pm2 -v
echo "EC2 bootstrap complete. App directory: $APP_DIR"