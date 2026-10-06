# Aegis log agent — two minutes

Requires Node 22+ and read permission for the logs. No dependencies, packet capture or privileged network access.

```sh
export AEGIS_URL=https://aegis-soc-diplom2.vercel.app
export INGEST_TOKEN='the-same-secret-as-the-server'
export AGENT_FILES=/var/log/auth.log,/var/log/nginx/access.log
node agent/aegis-agent.mjs
```

Set `INGEST_TOKEN` (at least 16 characters) in Vercel first and redeploy. Select **Ingested** in the console. Enable Upstash Redis to share the sliding window across serverless instances. On a local demo use `AEGIS_URL=http://localhost:3000`.

The agent starts at EOF. `AGENT_FROM_START=true` reads existing files. It handles rename rotation and copy-truncation, batches at most 500 lines / 512 KiB, retries transient failures with exponential backoff, and pauses reading at a 4 MiB memory queue. The offset is in memory; a process restart starts at EOF unless explicitly configured otherwise. Delivery is at-least-once after ambiguous network failures, not exactly-once. Invalid batches are discarded with an error, secrets and payloads are never logged. Oversized lines are skipped. Run under a service manager for production.
