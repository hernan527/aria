#!/bin/sh

# Gera config.js em runtime baseado em variáveis de ambiente
# Este arquivo será servido pelo Nginx e lido pelo frontend

# Deriva VITE_API_URL do domínio se não estiver definido
if [ -z "$VITE_API_URL" ] && [ -n "$KANBANCW_DOMAIN" ]; then
  export VITE_API_URL="https://${KANBANCW_DOMAIN}"
  echo "✓ VITE_API_URL derived from KANBANCW_DOMAIN: $VITE_API_URL"
fi

cat <<EOF > /usr/share/nginx/html/config.js
window.__RUNTIME_CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-window.location.origin}"
};
EOF

echo "Config gerado:"
cat /usr/share/nginx/html/config.js
