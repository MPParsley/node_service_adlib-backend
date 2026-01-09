#!/bin/bash

# LDES Initialization Script
# This script initializes the LDES event streams and views

set -e

LDES_URL=${LDES_URL:-http://localhost:9003}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Initializing LDES infrastructure at $LDES_URL"
echo ""

# Wait for LDES server to be ready
echo "Waiting for LDES server to be ready..."
for i in {1..30}; do
    if curl -sf "$LDES_URL/actuator/health" > /dev/null 2>&1; then
        echo "LDES server is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "ERROR: LDES server did not become ready in time"
        exit 1
    fi
    echo -n "."
    sleep 2
done
echo ""

# Create event streams
echo "Creating event streams..."
for stream in objecten archief thesaurus personen tentoonstellingen; do
    echo -n "  - Creating $stream event stream... "
    if curl -sf -X POST -H "content-type: text/turtle" \
        "$LDES_URL/admin/api/v1/eventstreams" \
        -d "@$SCRIPT_DIR/definitions/${stream}.ttl" > /dev/null 2>&1; then
        echo "✓"
    else
        echo "✗ (may already exist)"
    fi
done
echo ""

# Create views
echo "Creating paginated views..."
for stream in objecten archief thesaurus personen tentoonstellingen; do
    echo -n "  - Creating $stream by-page view... "
    if curl -sf -X POST -H "content-type: text/turtle" \
        "$LDES_URL/admin/api/v1/eventstreams/${stream}/views" \
        -d "@$SCRIPT_DIR/definitions/${stream}.by-page.ttl" > /dev/null 2>&1; then
        echo "✓"
    else
        echo "✗ (may already exist)"
    fi
done
echo ""

echo "LDES initialization complete!"
echo ""
echo "Event streams are available at:"
echo "  - $LDES_URL/objecten"
echo "  - $LDES_URL/archief"
echo "  - $LDES_URL/thesaurus"
echo "  - $LDES_URL/personen"
echo "  - $LDES_URL/tentoonstellingen"
echo ""
echo "Paginated views are available at:"
echo "  - $LDES_URL/objecten/by-page?pageNumber=1"
echo "  - $LDES_URL/archief/by-page?pageNumber=1"
echo "  - $LDES_URL/thesaurus/by-page?pageNumber=1"
echo "  - $LDES_URL/personen/by-page?pageNumber=1"
echo "  - $LDES_URL/tentoonstellingen/by-page?pageNumber=1"
