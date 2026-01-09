# LDES Infrastructure

This directory contains the Docker Compose configuration and definitions for the LDES (Linked Data Event Stream) server infrastructure.

## Quick Start

1. Start the LDES infrastructure:
   ```bash
   docker compose up -d --wait
   ```

2. Initialize event streams and views:
   ```bash
   ./init-ldes.sh
   ```

3. Verify services are running:
   ```bash
   docker compose ps
   curl http://localhost:9003/actuator/health
   ```

## Services

- **LDES Server**: Port 9003 (http://localhost:9003)
- **PostgreSQL**: Port 5432 (database: adlib_ldes)

## Directories

- `definitions/`: LDES event stream and view definitions (Turtle files)
- `scripts/`: Utility scripts for initialization and management

## Manual Initialization

If you prefer to initialize manually instead of using the script:

```bash
# Create event streams
for stream in objecten archief thesaurus personen tentoonstellingen; do
  curl -X POST -H "content-type: text/turtle" \
    "http://localhost:9003/admin/api/v1/eventstreams" \
    -d "@./definitions/${stream}.ttl"
done

# Create views
for stream in objecten archief thesaurus personen tentoonstellingen; do
  curl -X POST -H "content-type: text/turtle" \
    "http://localhost:9003/admin/api/v1/eventstreams/${stream}/views" \
    -d "@./definitions/${stream}.by-page.ttl"
done
```

## Stopping Services

```bash
docker compose down
```

To remove all data:
```bash
docker compose down -v
```

## Configuration

Edit `.env` file to customize:
- PostgreSQL credentials
- LDES hostname

## For more information

See the main documentation at `/docs/LDES_SETUP.md`
