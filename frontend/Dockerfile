FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 4173

RUN chmod a+rx ./build_run.sh

CMD ["./build_run.sh"]
