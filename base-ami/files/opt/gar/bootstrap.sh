#!/usr/bin/env bash

echo Retrieving AWS region...
export AWS_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/.$//')
aws configure set default.region $AWS_REGION

echo Retrieving instance information...
export AWS_INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)

# echo Export instance metadata as environment variables...
# . <(curl -fs http://169.254.169.254/latest/user-data | sed -r 's/^/export /')

echo Export instance tags as environment variables...
. <(aws ec2 describe-tags --filter "Name=resource-id,Values=${AWS_INSTANCE_ID}" --output=text | sed -r 's/TAGS\t(.*)\t.*\t.*\t(.*)/TAG_\1=\2/')

echo Export known instance tags with friendly names...
export GAR_APPLICATION=${TAG_app}
export GAR_ENVIRONMENT=${TAG_env}

echo Downloading gar-deploy...
aws s3 cp s3://${GAR_ENVIRONMENT}.yourdomain.com/gar-deploy.txt /tmp/gar-deploy.txt
GAR_DEPLOY_VERSION=$(cat /tmp/gar-deploy.txt)
GAR_DEPLOY_ARCHIVE=gar-deploy-${GAR_DEPLOY_VERSION}.tgz
aws s3 cp s3://${GAR_ENVIRONMENT}.yourdomain.com/${GAR_DEPLOY_ARCHIVE} /tmp/${GAR_DEPLOY_ARCHIVE}

echo Installing gar-deploy...
rm -rf gar-deploy
tar -xzvf /tmp/${GAR_DEPLOY_ARCHIVE}
mv package gar-deploy
pushd /opt/gar/gar-deploy
  npm install
popd

echo Starting ${KM_APPLICTION}...
node /opt/gar/gar-deploy/index.js forever --env=${GAR_ENVIRONMENT} --app=${GAR_APPLICATION}
