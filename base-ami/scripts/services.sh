#!/usr/bin/env bash
set -o errexit -o pipefail -o nounset
# set -o xtrace

echo Turning off sendmail...
chkconfig sendmail off
