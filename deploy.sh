#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "▸ Building..."
npx vite build

ASSET_PATHS=()
while IFS= read -r asset; do
  ASSET_PATHS+=("/assets/$(basename "$asset")")
done < <(find dist/assets -maxdepth 1 -type f)

echo "▸ Uploading app shell..."
aws s3 cp dist/index.html s3://s8njee.com/index.html

echo "▸ Syncing hashed app assets..."
aws s3 sync dist/assets/ s3://s8njee.com/assets/ --delete

echo "▸ Invalidating CloudFront..."
aws cloudfront create-invalidation --distribution-id E1AQDGH3QM4XK1 --paths "/" "/index.html" "${ASSET_PATHS[@]}"

echo "✓ Deployed to s8njee.com"
