FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG EXPO_PUBLIC_API_ROOT_URL=http://localhost:8080
ENV EXPO_PUBLIC_API_ROOT_URL=${EXPO_PUBLIC_API_ROOT_URL}
RUN npm run web:export

FROM nginx:stable-alpine
COPY nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
