import { Writable } from 'stream';
import Utils from './utils.js';
import LdesBackend from './LdesBackend.js';

/**
 * HybridBackend - Writes to both SQL and LDES backends
 *
 * This writable stream can write to:
 * - SQL database only (when LDES_ENABLED=false)
 * - LDES server only (when SQL_ENABLED=false)
 * - Both SQL and LDES (when both are enabled)
 *
 * This allows for gradual migration from SQL to LDES.
 */
class HybridBackend extends Writable {
    constructor(options) {
        super({ objectMode: true });

        this._adlibDatabase = options.adlibDatabase;
        this._institution = options.institution;
        this._db = options.db;
        this._correlator = options.correlator;

        // Configuration flags
        this._sqlEnabled = process.env.SQL_ENABLED !== 'false';
        this._ldesEnabled = process.env.LDES_ENABLED === 'true';

        // Create LDES backend if enabled
        if (this._ldesEnabled) {
            this._ldesBackend = new LdesBackend({
                adlibDatabase: this._adlibDatabase,
                institution: this._institution,
                correlator: this._correlator
            });
        }

        console.log(`[${this._correlator?.getId()}] HybridBackend initialized: SQL=${this._sqlEnabled}, LDES=${this._ldesEnabled}`);
    }

    /**
     * Write to SQL database
     * @param {Object} object - The JSON-LD object
     * @returns {Promise<void>}
     */
    async _writeToSql(object) {
        if (!this._sqlEnabled) {
            return;
        }

        try {
            await Utils.insertObject(
                this._institution,
                this._db,
                object,
                this._adlibDatabase,
                this._correlator
            );
        } catch (error) {
            console.error(`[${this._correlator?.getId()}] Error writing to SQL:`, error.message);
            throw error;
        }
    }

    /**
     * Write to LDES server
     * @param {Object} object - The JSON-LD object
     * @returns {Promise<void>}
     */
    async _writeToLdes(object) {
        if (!this._ldesEnabled || !this._ldesBackend) {
            return;
        }

        return new Promise((resolve, reject) => {
            this._ldesBackend._write(object, 'utf8', (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Get LDES statistics
     * @returns {Object|null} Statistics or null if LDES not enabled
     */
    getLdesStats() {
        if (this._ldesBackend) {
            return this._ldesBackend.getStats();
        }
        return null;
    }
}

/**
 * Write a chunk to the appropriate backend(s)
 * @param {Buffer|string|Object} chunk - The chunk to write
 * @param {string} encoding - The encoding
 * @param {Function} done - Callback when done
 */
HybridBackend.prototype._write = async function (chunk, encoding, done) {
    try {
        // Parse the object if it's a string or buffer
        let object;
        if (Buffer.isBuffer(chunk)) {
            object = JSON.parse(chunk.toString());
        } else if (typeof chunk === 'string') {
            object = JSON.parse(chunk);
        } else {
            object = chunk;
        }

        // Write to both backends in parallel if both are enabled
        const promises = [];

        if (this._sqlEnabled) {
            promises.push(this._writeToSql(object));
        }

        if (this._ldesEnabled) {
            promises.push(this._writeToLdes(object));
        }

        // Wait for all writes to complete
        await Promise.all(promises);

        done();
    } catch (error) {
        console.error(`[${this._correlator?.getId()}] Error in HybridBackend._write:`, error.message);
        // Pass error to callback to stop the stream
        done(error);
    }
};

export default HybridBackend;
