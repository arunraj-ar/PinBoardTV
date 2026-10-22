#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "🚀 PinBoardTV — AWS Serverless Backend Deployer"
echo "=========================================================="

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please run: brew install awscli"
    exit 1
fi

# Verify AWS credentials
echo "🔑 Verifying AWS credentials..."
CALLER_IDENTITY=$(aws sts get-caller-identity 2>&1)
if [ $? -ne 0 ]; then
    echo "❌ Failed to authenticate with AWS. Please run 'aws configure'."
    echo "$CALLER_IDENTITY"
    exit 1
fi

ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | grep -o '"Account": "[^"]*' | grep -o '[0-9]*')
CLI_REGION=$(aws configure get region 2>/dev/null || echo "")
REGION=${AWS_REGION:-${CLI_REGION:-ap-southeast-2}}
STACK_NAME=${STACK_NAME:-PinBoardTV-Stack}
ENV_STAGE=${ENV_STAGE:-prod}

echo "✅ Authenticated as Account: $ACCOUNT_ID in Region: $REGION"
echo ""

# 1. Build TypeScript Lambdas
echo "📦 Step 1: Building Lambda functions with esbuild..."
cd "$(dirname "$0")/.."
npm run build

# 2. Check if SAM CLI or standard AWS CloudFormation is available
if command -v sam &> /dev/null; then
    echo "⚡ Step 2: Deploying with AWS SAM CLI..."
    sam deploy \
      --template-file template.yaml \
      --stack-name "$STACK_NAME" \
      --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
      --region "$REGION" \
      --parameter-overrides Environment="$ENV_STAGE" \
      --resolve-s3
else
    echo "⚡ Step 2: SAM CLI not found; using AWS CloudFormation directly..."
    DEPLOY_BUCKET="pinboard-deployments-${ACCOUNT_ID}-${REGION}"
    
    # Create deployment bucket if not exists
    if ! aws s3api head-bucket --bucket "$DEPLOY_BUCKET" 2>/dev/null; then
        echo "Creating deployment artifact bucket: $DEPLOY_BUCKET..."
        aws s3 mb "s3://$DEPLOY_BUCKET" --region "$REGION"
    fi

    echo "Packaging CloudFormation template in $REGION..."
    aws cloudformation package \
      --template-file template.yaml \
      --s3-bucket "$DEPLOY_BUCKET" \
      --region "$REGION" \
      --output-template-file dist/packaged-template.yaml

    echo "Deploying CloudFormation stack: $STACK_NAME..."
    aws cloudformation deploy \
      --template-file dist/packaged-template.yaml \
      --stack-name "$STACK_NAME" \
      --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
      --region "$REGION" \
      --parameter-overrides Environment="$ENV_STAGE"
fi

echo ""
echo "🎉 Deployment Complete!"
echo "Retrieving stack outputs..."
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs" \
  --output table

echo ""
echo "👉 Copy the 'HttpApiUrl' above and add it to frontend/.env:"
echo "VITE_API_URL=<Your-HttpApiUrl>"
echo "VITE_WS_URL=<Your-WebSocketApiUrl>"
