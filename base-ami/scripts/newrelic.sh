#!/usr/bin/env bash
set -o errexit -o pipefail -o nounset
# set -o xtrace

echo Installing New Relic Server Monitor...
rpm -Uvh http://download.newrelic.com/pub/newrelic/el5/i386/newrelic-repo-5-3.noarch.rpm
yum install -y newrelic-sysmond
nrsysmond-config --set license_key= 5435e9c-your-newrelic-licence-key-e98b
chkconfig newrelic-sysmond off
