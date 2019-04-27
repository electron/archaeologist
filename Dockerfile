FROM node:alpine

# Labels for GitHub to read the action
LABEL "com.github.actions.name"="Archaeologist"
LABEL "com.github.actions.description"="Compares and verifies TypeScript artifacts."
LABEL "com.github.actions.icon"="tag"
LABEL "com.github.actions.color"="gray-dark"

# Copy the package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of your action's code
COPY . .

# Typescript Compilation
RUN npm run build

# Run Action code
ENTRYPOINT ["node", "/lib/index.js"]