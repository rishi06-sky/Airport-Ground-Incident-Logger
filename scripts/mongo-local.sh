#!/usr/bin/env bash
set -euo pipefail
if ! docker container inspect agil-mongo >/dev/null 2>&1; then
 docker run -d --name agil-mongo -p 127.0.0.1:27017:27017 -v agil-mongo-data:/data/db mongo:7.0@sha256:9896df581dfd0718b7abe112f4c37598d0986c54060e4ec1384997e6503c8c71 mongod --replSet agil --bind_ip_all
else
 docker start agil-mongo >/dev/null
fi
for attempt in $(seq 1 40); do
 if docker exec agil-mongo mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec agil-mongo mongosh --quiet --eval 'try { rs.status() } catch(e) { rs.initiate({_id:"agil",members:[{_id:0,host:"127.0.0.1:27017"}]}) }' >/dev/null
for attempt in $(seq 1 40); do
 if docker exec agil-mongo mongosh --quiet --eval 'if(!db.hello().isWritablePrimary) quit(1)' >/dev/null 2>&1; then echo 'MongoDB replica set ready'; exit 0; fi
 sleep 1
done
echo 'MongoDB did not become primary' >&2
exit 1
