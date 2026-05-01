#!/bin/sh
set -e

echo "Starting Kanban Backend..."
echo "DEBUG: CORS_ORIGIN before: '${CORS_ORIGIN}'"

# ============================================
# Mostra as variáveis de ambiente recebidas
# ============================================
echo "Environment variables:"
echo "  KANBANCW_DOMAIN: ${KANBANCW_DOMAIN:-not set}"
echo "  CHATWOOT_DOMAIN: ${CHATWOOT_DOMAIN:-not set}"
echo "  CHATWOOT_DATABASE_URL: ${CHATWOOT_DATABASE_URL:+***configured***}"
echo "  CORS_ORIGIN: ${CORS_ORIGIN:-not set}"
echo ""
echo "Note: URLs will be derived automatically by the backend code"
echo "============================================"

# Aguarda o PostgreSQL estar disponível
echo "Waiting for PostgreSQL..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  # Tenta executar uma query simples no banco
  if echo "SELECT 1;" | npx prisma db execute --stdin > /dev/null 2>&1; then
    echo "PostgreSQL is ready!"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting for PostgreSQL... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 3
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "Warning: Could not connect to PostgreSQL after $MAX_RETRIES attempts, proceeding anyway..."
fi

# Aplica migrações (cria/atualiza tabelas)
echo "Applying database migrations..."
npx prisma db push --accept-data-loss 2>&1 || echo "Migration completed or skipped"

# Gera Prisma Client (primeira vez, não há client antigo)
echo "Generating Prisma Client..."
npx prisma generate

# Limpa o Redis no startup (remove cache antigo)
echo "Flushing Redis cache..."
node -e "
const net = require('net');
const client = net.createConnection({ host: 'redis-kanban', port: 6379 }, () => {
  client.write('FLUSHALL\r\n');
  client.end();
  console.log('✓ Redis cache cleared');
});
client.on('error', () => console.log('⚠ Redis not available, skipping cache flush'));
client.setTimeout(2000);
client.on('timeout', () => { client.destroy(); console.log('⚠ Redis timeout'); });
" 2>/dev/null || echo "⚠ Failed to clear Redis cache"

# Inicia a aplicação
echo "Starting server..."
exec node dist/index.js
