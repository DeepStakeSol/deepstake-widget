# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies separately (for caching)
#COPY package*.json patches ./
#RUN npm install

# Copy project files
COPY . .

RUN npm install

# Expose Vite default port
EXPOSE 4173

RUN chmod a+rx ./build_run.sh

# Start Vite dev server
CMD ["./build_run.sh"]
