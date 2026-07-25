FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# Start Next.js in dev mode
CMD ["npm", "run", "dev"]
