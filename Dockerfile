FROM node:18-alpine

WORKDIR /app

# Install python and build tools for native dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

COPY app.js ./

# Create directories for uploads and data
RUN mkdir -p uploads/music uploads/covers data

EXPOSE 8080

CMD ["npm", "start"]
