#!/usr/bin/env bash
set -o errexit -o pipefail -o nounset
# set -o xtrace

echo Applying pending updates...
yum update -y

yum install -y mysql
