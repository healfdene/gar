#!/usr/bin/env bash
set -o errexit -o pipefail -o nounset
# set -o xtrace

echo Installing Node.js...
curl -sL https://rpm.nodesource.com/setup | bash -
yum install -y nodejs

echo Installing Development Tools to Support Node.js...
yum groupinstall -y "Development Tools"
yum install -y libicu-devel
