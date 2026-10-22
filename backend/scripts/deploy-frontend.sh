#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "🚀 PinBoardTV — Deploying Frontend to AWS S3 & CloudFront"
echo "=========================================================="

cd "$(dirname "$0")/../.."

# 1. Build Frontend
echo "📦 Step 1: Building production Vite bundle in frontend/..."
npm run build --prefix frontend

# 2. Get AWS Account and Region
CALLER_IDENTITY=$(export HOME=/Users/arunrajar && /opt/homebrew/bin/aws sts get-caller-identity 2>&1)
ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | grep -o '"Account": "[^"]*' | grep -o '[0-9]*')
REGION=${AWS_REGION:-ap-southeast-2}
ENV_STAGE=${ENV_STAGE:-prod}
BUCKET_NAME="pinboard-web-${ACCOUNT_ID}-${REGION}-${ENV_STAGE}"

# 3. Sync to S3
echo "☁️ Step 2: Syncing frontend/dist/ to s3://${BUCKET_NAME}..."
export HOME=/Users/arunrajar && /opt/homebrew/bin/aws s3 sync frontend/dist "s3://${BUCKET_NAME}" --delete --region "$REGION"

# 4. Invalidate CloudFront cache if distribution exists
echo "⚡ Step 3: Checking for CloudFront distribution..."
DIST_DOMAIN=$(export HOME=/Users/arunrajar && /opt/homebrew/bin/aws cloudformation describe-stacks --stack-name PinBoardTV-Stack --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text 2>/dev/null || echo "")

if [ -n "$DIST_DOMAIN" ] && [ "$DIST_DOMAIN" != "None" ]; then
    DIST_ID=$(export HOME=/Users/arunrajar && /opt/homebrew/bin/aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='${DIST_DOMAIN#https://}'].Id" --output text 2>/dev/null || echo "")
    if [ -n "$DIST_ID" ]; then
        echo "🔄 Invalidating CloudFront cache for distribution: $DIST_ID..."
        export HOME=/Users/arunrajar && /opt/homebrew/bin/aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" > /dev/null
    fi
fi

echo ""
echo "🎉 Frontend Deployed Successfully!"
if [ -n "$DIST_DOMAIN" ] && [ "$DIST_DOMAIN" != "None" ]; then
    echo "👉 Live Global HTTPS URL: $DIST_DOMAIN"
    echo "   TV App:      $DIST_DOMAIN/#/tv"
    echo "   Mobile App:  $DIST_DOMAIN/#/join"
fi
