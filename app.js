console.log("hello world!");

import { CronJob } from 'cron';
import { app, uuid, errorHandler, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import request from 'request';
import { querySudo as query, updateSudo as update } from './auth-sudo';

/** Schedule packaging cron job */
const cronFrequency = process.env.PACKAGE_CRON_PATTERN || '*/15 * * * * *';

new CronJob(cronFrequency, function() {
  console.log(`Blockchain informing service called at ${new Date().toISOString()}`);
  request.post('http://localhost/create-signing-requests/');
}, null, true);

app.post('/create-signing-requests/', async function( req, res, next ) {
  console.log("creating signing requests");

  try {
    let unsignedZittingen = (await query(`
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
      PREFIX prov: <http://www.w3.org/ns/prov#>
      PREFIX sign: <http://mu.semte.ch/vocabularies/ext/signing/>
      PREFIX dct: <http://purl.org/dc/terms/>

      SELECT ?zitting
      WHERE {
        GRAPH ?zittingGraph {
          ?zitting a besluit:Zitting;
                   besluit:heeftNotulen ?notulen.
        }
        FILTER NOT EXISTS {
          GRAPH <http://lblod.info/blockchain> {
            ?blockchain a sign:SignedResource;
                        dct:subject ?zitting.
          }
        }
      }
    `)).results.bindings.map( (binding) => binding.zitting.value );

    console.log(`Found ${unsignedZittingen.length} zittingen`);
    console.log(JSON.stringify( unsignedZittingen ));

    for( const zittingUri of unsignedZittingen ) {
      let blockchainUri = `http://lblod.info/blockchain/signatures/${uuid()}`;
      try {
        // TODO await all the calls, then inform the blockchain service
        await update(`
          PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
          PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
          PREFIX prov: <http://www.w3.org/ns/prov#>
          PREFIX sign: <http://mu.semte.ch/vocabularies/ext/signing/>
          PREFIX pav: <http://purl.org/pav/>
          PREFIX dct: <http://purl.org/dc/terms/>

          INSERT {
            GRAPH <http://lblod.info/blockchain> {
              <${blockchainUri}> a sign:SignedResource;
                                 dct:subject <${zittingUri}>;
                                 sign:status <http://mu.semte.ch/vocabularies/ext/signing/publication-status/unpublished>;
                                 sign:text ?zittingContent.
            }
          }
          WHERE {
            GRAPH ?g {
              <${zittingUri}> a besluit:Zitting;
                              pav:derivedFrom ?zittingContent.
            }
          }
        `);
      } catch(e) {
        console.log(`An error occurred whilst creating the blockchain signature request: ${e}`);
      }
    }

    // inform the blockchain component that something has arrived
    console.log('informing the blockchain');
    request.post( "/blockchain/notify" );

    return true;
  } catch(e) {
    console.log(`An error occurred`);
    // return next( new Error(e.message) );
    return "fail";
  }
});

console.log("Loaded blockchain informing service");
