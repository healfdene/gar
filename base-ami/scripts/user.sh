#!/usr/bin/env bash
set -o errexit -o pipefail -o nounset
# set -o xtrace

echo Creating gar user...
useradd gar

echo Creating application folder for gar user...
mkdir -p /opt/gar/
chown -R gar:gar /opt/gar/

echo Creating log folder for gar user...
mkdir -p /var/log/gar/
chown -R gar:gar /var/log/gar/
