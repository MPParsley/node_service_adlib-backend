import { Writable } from 'stream';
import axios from 'axios';
import jsonld from 'jsonld';
import { Writer } from 'n3';
import config from '../config/config.js';

/**
 * LdesBackend - Writes JSON-LD objects to an LDES (Linked Data Event Stream) server
 *
 * This writable stream accepts JSON-LD objects, converts them to Turtle format,
 * and POSTs them to the appropriate LDES event stream endpoint.
 */
class LdesBackend extends Writable {
    constructor(options) {
        super({ objectMode: true });

        this._adlibDatabase = options.adlibDatabase;
        this._institution = options.institution;
        this._correlator = options.correlator;

        // LDES configuration
        this._ldesBaseUrl = process.env.LDES_BASE_URL || config.ldes?.baseUrl || 'http://localhost:9003';
        this._timeout = parseInt(process.env.LDES_TIMEOUT) || config.ldes?.timeout || 30000;
        this._retryAttempts = parseInt(process.env.LDES_RETRY_ATTEMPTS) || config.ldes?.retryAttempts || 3;
        this._retryDelay = parseInt(process.env.LDES_RETRY_DELAY) || config.ldes?.retryDelay || 1000;

        // Map adlib database types to LDES event stream paths
        this._streamMapping = {
            'objecten': 'objecten',
            'archief': 'archief',
            'thesaurus': 'thesaurus',
            'personen': 'personen',
            'tentoonstellingen': 'tentoonstellingen'
        };

        // Statistics
        this._stats = {
            posted: 0,
            failed: 0
        };
    }

    /**
     * Convert JSON-LD object to Turtle format
     * @param {Object} jsonldObject - The JSON-LD object to convert
     * @returns {Promise<string>} Turtle string
     */
    async _convertToTurtle(jsonldObject) {
        try {
            // First, expand the JSON-LD to normalize it
            const expanded = await jsonld.expand(jsonldObject);

            // Convert to N-Quads (an RDF format)
            const nquads = await jsonld.toRDF(jsonldObject, { format: 'application/n-quads' });

            // Parse N-Quads and write as Turtle
            return new Promise((resolve, reject) => {
                const writer = new Writer({ format: 'text/turtle' });
                const parser = new (require('n3').Parser)({ format: 'N-Quads' });

                parser.parse(nquads, (error, quad, prefixes) => {
                    if (error) {
                        reject(error);
                    } else if (quad) {
                        writer.addQuad(quad);
                    } else {
                        // Parsing complete
                        writer.end((error, result) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve(result);
                            }
                        });
                    }
                });
            });
        } catch (error) {
            throw new Error(`Failed to convert JSON-LD to Turtle: ${error.message}`);
        }
    }

    /**
     * POST data to LDES server with retry logic
     * @param {string} turtle - Turtle-formatted RDF data
     * @param {string} streamPath - LDES stream path
     * @param {number} attempt - Current attempt number
     * @returns {Promise<void>}
     */
    async _postToLdes(turtle, streamPath, attempt = 1) {
        const url = `${this._ldesBaseUrl}/${streamPath}`;

        try {
            const response = await axios.post(url, turtle, {
                headers: {
                    'Content-Type': 'text/turtle',
                    'X-Correlation-ID': this._correlator?.getId() || 'unknown'
                },
                timeout: this._timeout
            });

            if (response.status === 200 || response.status === 201) {
                this._stats.posted++;
                console.log(`[${this._correlator?.getId()}] Posted to LDES ${streamPath} (total: ${this._stats.posted})`);
                return;
            } else {
                throw new Error(`Unexpected status code: ${response.status}`);
            }
        } catch (error) {
            const errorMsg = error.response?.data || error.message;
            console.error(`[${this._correlator?.getId()}] Failed to POST to LDES ${streamPath} (attempt ${attempt}/${this._retryAttempts}): ${errorMsg}`);

            if (attempt < this._retryAttempts) {
                // Exponential backoff
                const delay = this._retryDelay * Math.pow(2, attempt - 1);
                console.log(`[${this._correlator?.getId()}] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this._postToLdes(turtle, streamPath, attempt + 1);
            } else {
                this._stats.failed++;
                throw new Error(`Failed to POST to LDES after ${this._retryAttempts} attempts: ${errorMsg}`);
            }
        }
    }

    /**
     * Ensure required LDES properties exist
     * @param {Object} jsonldObject - The JSON-LD object to check
     * @returns {Object} The object with required properties
     */
    _ensureLdesProperties(jsonldObject) {
        // Ensure the object has required LDES versioning properties
        if (!jsonldObject['prov:generatedAtTime']) {
            jsonldObject['prov:generatedAtTime'] = new Date().toISOString();
        }

        // Ensure dcterms:isVersionOf is set (points to the base URI without timestamp)
        if (!jsonldObject['dcterms:isVersionOf'] && jsonldObject['@id']) {
            // Extract base URI without timestamp if present
            const baseUri = jsonldObject['@id'].split(/\/\d{4}-\d{2}-\d{2}T/)[0];
            jsonldObject['dcterms:isVersionOf'] = { '@id': baseUri };
        }

        return jsonldObject;
    }

    /**
     * Get the LDES stream path for a given adlib database
     * @param {string} adlibDatabase - The adlib database name
     * @returns {string} The LDES stream path
     */
    _getStreamPath(adlibDatabase) {
        const streamPath = this._streamMapping[adlibDatabase];
        if (!streamPath) {
            throw new Error(`Unknown adlib database type: ${adlibDatabase}`);
        }
        return streamPath;
    }

    /**
     * Get statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this._stats };
    }
}

/**
 * Write a chunk (JSON-LD object) to the LDES server
 * @param {Buffer|string} chunk - The chunk to write (JSON string or Buffer)
 * @param {string} encoding - The encoding
 * @param {Function} done - Callback when done
 */
LdesBackend.prototype._write = async function (chunk, encoding, done) {
    try {
        // Parse the JSON-LD object
        let object;
        if (Buffer.isBuffer(chunk)) {
            object = JSON.parse(chunk.toString());
        } else if (typeof chunk === 'string') {
            object = JSON.parse(chunk);
        } else {
            object = chunk;
        }

        // Ensure LDES properties
        object = this._ensureLdesProperties(object);

        // Get the appropriate LDES stream path
        const streamPath = this._getStreamPath(this._adlibDatabase);

        // Convert to Turtle
        const turtle = await this._convertToTurtle(object);

        // POST to LDES
        await this._postToLdes(turtle, streamPath);

        done();
    } catch (error) {
        console.error(`[${this._correlator?.getId()}] Error in LdesBackend._write:`, error.message);
        // Don't fail the stream, just log the error
        done();
    }
};

export default LdesBackend;
