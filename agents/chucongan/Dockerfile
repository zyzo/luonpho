FROM node:22-alpine AS build
WORKDIR /app
COPY agents/chucongan/package.json agents/chucongan/package-lock.json ./
RUN npm ci
COPY agents/chucongan ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY agents/chucongan/package.json agents/chucongan/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
USER node
EXPOSE 3000
CMD ["npm", "start"]
