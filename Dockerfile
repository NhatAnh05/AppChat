# Multi-stage: Node build React -> Nginx serve static assets.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_CHAT_WS_URL=wss://chat.longapp.io.vn/chat/chat
ENV VITE_CHAT_WS_URL=${VITE_CHAT_WS_URL}
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
