# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Optional browser-visible CARTO basemap key, supplied by the operator.
ARG VITE_CARTO_BASEMAP_API_KEY=
ENV VITE_CARTO_BASEMAP_API_KEY=$VITE_CARTO_BASEMAP_API_KEY

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
