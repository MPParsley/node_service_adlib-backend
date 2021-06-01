import Utils from "./utils.js";
import ObjectMapper from "./objectMapper";

export default class StamMapper extends ObjectMapper {
    constructor(options) {
        super(options);
    }

    _transform(object, encoding, done) {
        let input = JSON.parse(object);
        this.doMapping(input, done);
    }

    async doMapping(input, done) {
        let mappedObject = {};
        mappedObject["@context"] = this._context;

        try {
            let now = new Date().toISOString();
            let baseURI = this._baseURI.endsWith('/') ? this._baseURI : this._baseURI + '/';
            let objectURI = baseURI + "mensgemaaktobject" + '/' + this._institution + '/' + input["@attributes"].priref;
            let versionURI = objectURI + "/" + now;
            mappedObject["@id"] = versionURI;
            mappedObject["@type"] = "MensgemaaktObject";
            // Event stream metadata
            mappedObject["dcterms:isVersionOf"] = objectURI;
            // mappedObject["prov:generatedAtTime"] = new Date(input["@attributes"].modification).toISOString();
            mappedObject["prov:generatedAtTime"] = now;

            // Convenience method to make our URI dereferenceable by District09
            if (versionURI.indexOf('stad.gent/id') != -1) mappedObject["foaf:page"] = versionURI;

            // Identificatie
            Utils.mapInstelling(this._institutionURI, input, mappedObject);
            Utils.mapObjectnummer(input, mappedObject);
            await Utils.mapObjectnaam(objectURI, input, mappedObject, this._adlib);
            await Utils.mapObjectCategorie(objectURI, input, mappedObject, this._adlib);
            Utils.mapTitel(input, mappedObject);
            Utils.mapBeschrijving(input, mappedObject);

            // Vervaardiging | datering
            await Utils.mapVervaardiging(objectURI, input, mappedObject, this._adlib);

            // Fysieke kenmerken
            await Utils.mapFysiekeKenmerken(input, mappedObject, this._adlib);

            // Verwerving
            await Utils.mapVerwerving(objectURI, this._institutionURI, input, mappedObject, this._adlib);

        } catch (e) {
            console.error(e);
        }
        done(null, JSON.stringify(mappedObject));
    }
}