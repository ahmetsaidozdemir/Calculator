# syntax=docker/dockerfile:1

# --- Build the React app --------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Serve it with nginx, proxying /api to the backend --------------------------
FROM nginx:1.27-alpine
# The official image renders /etc/nginx/templates/*.template with the container's
# environment variables at start-up (only variables that are set are substituted).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_URL=http://backend:8080
EXPOSE 80
