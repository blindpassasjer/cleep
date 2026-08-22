#!/bin/sh
set -e

echo "Running database migrations..."
node dist-server/db/migrate.js

echo "Bootstrapping admin account..."
node dist-server/db/bootstrapAdmin.js

echo "Starting server..."
exec "$@"
