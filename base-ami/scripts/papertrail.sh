#!/usr/bin/env bash
set -o errexit -o pipefail -o nounset
# set -o xtrace

echo Downloading papertrail remote_syslog...
wget https://github.com/papertrail/remote_syslog2/releases/download/v0.13/remote_syslog_linux_amd64.tar.gz
tar xzf remote_syslog*.tar.gz
rm remote_syslog*.tar.gz

echo Installing remote_syslog...
mkdir /opt/papertrail
mv remote_syslog /opt/papertrail
