FROM nginx:alpine

COPY usr/share/nginx/html /usr/share/nginx/html
COPY etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-generate-config.sh /docker-entrypoint.d/40-generate-config.sh

RUN chmod +x /docker-entrypoint.d/40-generate-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
