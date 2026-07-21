# Quickstart Running Aura Standalone

```shell
# optional: update the Cloud Ops Agent config to log into Cloud Logging
cp ./cloud-ops-agent.yaml /etc/google-cloud-ops-agent/config.yaml
systemctl restart google-cloud-ops-agent.service

# setup the binaries & frontend
mkdir -p /opt/aurad
cd /opt/aurad
cp ~/<yourconfig>/conf.json ./conf.json
cp ~/<yourbackend>/aurad ./aurad
cp -R ~/<yourfrontend>/dist ./frontend

# make binary executable
chmod +x aurad

# create empty tokens file - the service with DynamicUser option will not be able to do so
touch tokens.list

# add systemd unit, contents see ./aurad.service
systemctl edit --force --full aurad

# enable & start it
systemctl enable --now aurad

# follow the logs
journalctl -f -u aurad
```
