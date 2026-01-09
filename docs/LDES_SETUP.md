# LDES (Linked Data Event Stream) Setup Guide

This guide explains how to set up and use the LDES infrastructure for publishing cultural heritage data from Adlib sources.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Usage](#usage)
7. [Data Flow](#data-flow)
8. [Troubleshooting](#troubleshooting)

## Overview

The LDES (Linked Data Event Stream) infrastructure replaces the traditional SQL database storage with a standardized approach for publishing and consuming linked data as event streams. This setup enables:

- **Immutable versioning**: Each object version is preserved as a member in the event stream
- **Standardized consumption**: Clients can replicate and synchronize data using standard protocols
- **Temporal ordering**: Data is ordered by generation time for proper event sequencing
- **Fragmented views**: Large datasets are split into manageable pages for efficient retrieval

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Adlib API (NTLM)                             │
│         https://cjm-web.adlibhosting.com/coghentapi             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP GET
                         ▼
        ┌────────────────────────────────────────────┐
        │  Adlib Readable Stream                     │
        │  (pagination: startFrom, limit)            │
        └────────────────────────────────────────────┘
                         │ JSON records
                         ▼
        ┌────────────────────────────────────────────┐
        │  Institution-Specific Mapper               │
        │  - Transforms to JSON-LD                   │
        │  - Adds semantic context                   │
        └────────────────────────────────────────────┘
                         │ JSON-LD
                         ▼
        ┌────────────────────────────────────────────┐
        │  Backend LDES Writer                       │
        │  - POSTs to LDES Server                    │
        │  - Converts JSON-LD to Turtle              │
        └────────────────────────────────────────────┘
                         │ HTTP POST (Turtle)
                         ▼
        ┌────────────────────────────────────────────┐
        │  LDES Server (Port 9003)                   │
        │  - Stores members with versioning          │
        │  - Provides paginated views                │
        │  - Serves event streams                    │
        └────────────────────────────────────────────┘
                         │ PostgreSQL
                         ▼
        ┌────────────────────────────────────────────┐
        │  PostgreSQL Database                       │
        │  - Persistent storage for LDES members     │
        └────────────────────────────────────────────┘
```

### Components

1. **LDES Server**: Accepts and serves linked data members
   - Port: 9003 (external), 80 (internal)
   - Admin API: `/admin/api/v1/`
   - Data ingestion: POST to event stream endpoints

2. **PostgreSQL Database**: Persistent storage for LDES
   - Port: 5432
   - Database: `adlib_ldes`

3. **Event Streams**: Separate streams per data type
   - `/objecten` - Museum objects (DMG, HVA, Industriemuseum, STAM, Archief Gent)
   - `/archief` - Archive materials (DMG)
   - `/thesaurus` - Concepts and terms
   - `/personen` - Persons and agents
   - `/tentoonstellingen` - Exhibitions (DMG)

## Prerequisites

- Docker Desktop installed and running
- Docker Compose v2.0 or higher
- Git
- Node.js 18+ (for running the adlib-backend service)
- Network access to:
  - Adlib API (cjm-web.adlibhosting.com)
  - Docker Hub (for pulling images)

## Installation

### 1. Start LDES Infrastructure

Navigate to the ldes directory and start the services:

```bash
cd ldes
docker compose up -d --wait
```

This will:
- Start PostgreSQL database
- Start LDES Server
- Wait for health checks to pass

Verify services are running:
```bash
docker compose ps
```

### 2. Create Event Stream Definitions

Create the five event streams for different data types:

```bash
# Objects event stream
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams" \
  -d "@./definitions/objecten.ttl"

# Archive event stream
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams" \
  -d "@./definitions/archief.ttl"

# Thesaurus event stream
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams" \
  -d "@./definitions/thesaurus.ttl"

# Persons event stream
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams" \
  -d "@./definitions/personen.ttl"

# Exhibitions event stream
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams" \
  -d "@./definitions/tentoonstellingen.ttl"
```

### 3. Create Paginated Views

Create views for each event stream to enable efficient data retrieval:

```bash
# Objecten view
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams/objecten/views" \
  -d "@./definitions/objecten.by-page.ttl"

# Archief view
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams/archief/views" \
  -d "@./definitions/archief.by-page.ttl"

# Thesaurus view
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams/thesaurus/views" \
  -d "@./definitions/thesaurus.by-page.ttl"

# Personen view
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams/personen/views" \
  -d "@./definitions/personen.by-page.ttl"

# Tentoonstellingen view
curl -X POST -H "content-type: text/turtle" \
  "http://localhost:9003/admin/api/v1/eventstreams/tentoonstellingen/views" \
  -d "@./definitions/tentoonstellingen.by-page.ttl"
```

### 4. Configure adlib-backend Service

Update your `.env` file or environment variables:

```bash
# LDES Configuration
LDES_ENABLED=true
LDES_BASE_URL=http://localhost:9003

# Optional: Disable SQL storage if only using LDES
SQL_ENABLED=false
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LDES_ENABLED` | Enable LDES posting | `false` |
| `LDES_BASE_URL` | LDES Server base URL | `http://localhost:9003` |
| `SQL_ENABLED` | Enable SQL storage (can run both) | `true` |
| `LDES_TIMEOUT` | HTTP timeout for LDES posts (ms) | `30000` |
| `LDES_RETRY_ATTEMPTS` | Number of retry attempts on failure | `3` |
| `LDES_RETRY_DELAY` | Delay between retries (ms) | `1000` |

### Event Stream Mapping

The service automatically maps Adlib database types to LDES event streams:

| Adlib Database | LDES Event Stream | Endpoint |
|----------------|-------------------|----------|
| `objecten` | objecten | `http://localhost:9003/objecten` |
| `archief` | archief | `http://localhost:9003/archief` |
| `thesaurus` | thesaurus | `http://localhost:9003/thesaurus` |
| `personen` | personen | `http://localhost:9003/personen` |
| `tentoonstellingen` | tentoonstellingen | `http://localhost:9003/tentoonstellingen` |

## Usage

### Starting Data Ingestion

Once the LDES infrastructure is running, start the adlib-backend service:

```bash
# Install dependencies
npm install

# Start the service (will begin harvesting based on schedule)
npm start

# Or trigger immediate harvest
ADLIB_START=true npm start
```

The service will:
1. Fetch data from Adlib API
2. Transform to JSON-LD
3. Convert to Turtle format
4. POST to appropriate LDES event stream

### Querying Event Streams

#### List Available Event Streams

```bash
curl http://localhost:9003/
```

#### Get Event Stream Metadata

```bash
curl http://localhost:9003/objecten
```

#### Retrieve Paginated Data

```bash
# First page
curl http://localhost:9003/objecten/by-page?pageNumber=1

# Second page
curl http://localhost:9003/objecten/by-page?pageNumber=2
```

#### Get Member Count

```bash
curl http://localhost:9003/admin/api/v1/eventstreams/objecten
```

### Monitoring

Check LDES Server logs:
```bash
cd ldes
docker compose logs -f ldes-server
```

Check PostgreSQL connection:
```bash
docker compose exec ldes-postgres psql -U admin -d adlib_ldes -c "SELECT COUNT(*) FROM members;"
```

## Data Flow

### Ingestion Process

1. **Harvest**: Adlib API fetches data for each institution
2. **Transform**: Mapper converts to JSON-LD with semantic context
3. **Convert**: Backend converts JSON-LD to Turtle (RDF)
4. **POST**: HTTP POST to LDES Server endpoint
5. **Store**: LDES Server stores member with versioning
6. **Index**: Member becomes available in paginated views

### Version Management

Each object version is stored as a separate member with:
- **Version ID**: `dcterms:isVersionOf` points to the canonical object URI
- **Timestamp**: `prov:generatedAtTime` indicates when version was created
- **Immutability**: Once stored, members are never modified or deleted

### Example Member

```turtle
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix prov: <http://www.w3.org/ns/prov#> .

<https://stad.gent/id/objecten/530043981/2024-01-09T10:30:00.000Z>
  dcterms:isVersionOf <https://stad.gent/id/objecten/530043981> ;
  prov:generatedAtTime "2024-01-09T10:30:00.000Z"^^xsd:dateTime ;
  # ... other properties
  .
```

## Troubleshooting

### Issue: LDES Server not accepting data

**Symptoms**: POST requests return 400 or 500 errors

**Solutions**:
1. Verify event stream is created:
   ```bash
   curl http://localhost:9003/admin/api/v1/eventstreams
   ```

2. Check if data format is valid Turtle:
   ```bash
   # Test with example data
   curl -X POST -H "content-type: text/turtle" \
     "http://localhost:9003/objecten" \
     -d "@./test-member.ttl" -v
   ```

3. Check LDES Server logs:
   ```bash
   docker compose logs ldes-server
   ```

### Issue: No data appearing in views

**Symptoms**: Event stream exists but views return empty pages

**Solutions**:
1. Verify view is created:
   ```bash
   curl http://localhost:9003/admin/api/v1/eventstreams/objecten/views
   ```

2. Check if members were actually ingested:
   ```bash
   curl http://localhost:9003/admin/api/v1/eventstreams/objecten
   ```

3. Recreate the view with correct configuration

### Issue: Connection refused to LDES Server

**Symptoms**: Backend service cannot connect to localhost:9003

**Solutions**:
1. Check if LDES Server is running:
   ```bash
   docker compose ps
   ```

2. Verify port mapping:
   ```bash
   docker compose port ldes-server 80
   ```

3. Check firewall/network settings

4. If running backend in Docker, use service name:
   ```bash
   LDES_BASE_URL=http://ldes-server
   ```

### Issue: Slow ingestion performance

**Symptoms**: Data posting takes too long

**Solutions**:
1. Increase concurrent connections (if supported)
2. Adjust `LDES_TIMEOUT` if requests are timing out
3. Monitor PostgreSQL performance:
   ```bash
   docker compose exec ldes-postgres psql -U admin -d adlib_ldes \
     -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables WHERE schemaname='public';"
   ```

4. Consider batching (if LDES Server supports batch ingestion)

### Issue: Duplicate members

**Symptoms**: Same object version appears multiple times

**Solutions**:
1. LDES Server should handle deduplication automatically based on member URI
2. Ensure each version has a unique URI (includes timestamp)
3. Check mapper logic to ensure consistent URI generation

## Advanced Configuration

### Running Multiple Environments

For development, staging, and production:

```bash
# Development
LDES_BASE_URL=http://localhost:9003 npm start

# Staging
LDES_BASE_URL=https://staging-ldes.example.com npm start

# Production
LDES_BASE_URL=https://ldes.stad.gent npm start
```

### Custom Event Stream Definitions

Edit the `.ttl` files in `ldes/definitions/` to customize:
- Retention policies
- Versioning strategies
- Temporal ordering
- Fragment sizes

Then recreate the event streams and views.

### Hybrid Mode (SQL + LDES)

Run both storage backends simultaneously:

```bash
LDES_ENABLED=true
SQL_ENABLED=true
```

This enables:
- Gradual migration from SQL to LDES
- Comparison and validation
- Fallback option during transition

## Additional Resources

- [LDES Specification](https://semiceu.github.io/LinkedDataEventStreams/)
- [LDES Server Documentation](https://informatievlaanderen.github.io/VSDS-LDESServer/)
- [VSDS Onboarding Examples](https://github.com/Informatievlaanderen/VSDS-Onboarding-Example)
- [Linked Data Principles](https://www.w3.org/DesignIssues/LinkedData.html)
- [RDF 1.1 Turtle](https://www.w3.org/TR/turtle/)

## Support

For issues specific to:
- **LDES Server**: [VSDS-LDESServer Issues](https://github.com/Informatievlaanderen/VSDS-LDESServer/issues)
- **This backend**: [adlib-backend Issues](https://github.com/MPParsley/node_service_adlib-backend/issues)
- **Adlib API**: Contact Adlib support
