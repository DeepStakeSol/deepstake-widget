FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Start Next.js in dev mode
CMD ["npm", "run", "dev"]
