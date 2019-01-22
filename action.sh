#!/bin/bash

mkdir -p artifacts

export BASE_BRANCH=$(git show-branch | grep '*' | grep -v "$(git rev-parse --abbrev-ref HEAD)" | head -n1 | sed 's/.*\[\(.*\)\].*/\1/' | sed 's/[\^~].*//')

if [[ -z "$BASE_BRANCH" ]]; then
	# We are likely already on the master branch.
	BASE_BRANCH=master
fi

git merge-base origin/$BASE_BRANCH HEAD > .dig-old

rm -rf node_modules && npm install

echo "#!/usr/bin/env node\nglobal.x=1" > node_modules/typescript/bin/tsc

node node_modules/.bin/electron-docs-linter docs --outfile=electron-api.json --version=0.0.0-archaeologist.0

node node_modules/.bin/electron-typescript-definitions docs --in=electron-api.json --out=artifacts/electron.new.d.ts

git checkout .

git checkout $(cat .dig-old)

rm -rf node_modules && npm install

echo "#!/usr/bin/env node\nglobal.x=1" > node_modules/typescript/bin/tsc

node node_modules/.bin/electron-docs-linter docs --outfile=electron-api.json --version=0.0.0-archaeologist.0

node node_modules/.bin/electron-typescript-definitions docs --in=electron-api.json --out=artifacts/electron.old.d.ts

mv .dig-old artifacts

our_diff=$(diff artifacts/*)
if [[ "$our_diff" != "" ]]; then
	echo "DIFF CHECK FAILED: Update the typescript file."
	exit 1
else
	echo "DIFF CHECK PASSED: All files up to date."
fi
