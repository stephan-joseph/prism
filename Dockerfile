FROM node:22-alpine
WORKDIR /app
COPY package.json ./
# the Netlify packages are not used here
RUN npm pkg delete dependencies.@netlify/blobs dependencies.@netlify/functions \
 && npm install --omit=dev --no-audit --no-fund
COPY index.html guide.html usage.html extract-prompt.mjs ./
COPY lib ./lib
COPY docs ./docs
COPY server ./server
RUN mkdir -p /data/usage && chown -R node:node /data
USER node
ENV PORT=8080 USAGE_DIR=/data/usage NODE_ENV=production
EXPOSE 8080
CMD ["node", "server/server.mjs"]
