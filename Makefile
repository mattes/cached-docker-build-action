NCC = ./node_modules/@vercel/ncc/dist/ncc/cli.js

build:
	rm -rf dist
	$(NCC) build index.js --license LICENSE

