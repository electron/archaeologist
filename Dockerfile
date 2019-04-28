FROM node:10

# Labels for GitHub to read the action
LABEL "com.github.actions.name"="Archaeologist"
LABEL "com.github.actions.description"="Compares and verifies TypeScript artifacts."
LABEL "com.github.actions.icon"="tag"
LABEL "com.github.actions.color"="gray-dark"

# Copy the package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn

# Copy the rest of your action's code
COPY . .

# Typescript Compilation
RUN yarn build

# Run Action code
ENTRYPOINT ["node", "/lib/index.js"]