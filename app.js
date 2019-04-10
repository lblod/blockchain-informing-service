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
  console.log("Init signing requests");

  try {

    let resourcesToSendNotificationFor = (await query(`
        PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
        PREFIX sign: <http://mu.semte.ch/vocabularies/ext/signing/>

        SELECT DISTINCT ?g ?type ?resource ?status{
          GRAPH ?g {
            ?resource a ?type;
            sign:status ?status.
            FILTER(?type IN (sign:SignedResource, sign:PublishedResource, sign:BurnedResource)).
            FILTER(?status IN ( <http://mu.semte.ch/vocabularies/ext/signing/publication-status/unpublished>,
                                <http://mu.semte.ch/vocabularies/ext/signing/publication-status/unburned>))
          }
        }
    `)).results.bindings;


    console.log(`Found ${resourcesToSendNotificationFor.length} unpublished resources`);
    console.log(JSON.stringify( resourcesToSendNotificationFor ));

    // inform the blockchain component that something has arrived
    if(resourcesToSendNotificationFor.length > 0){
      console.log('informing the blockchain');
      await notify();
    }
    else {
      console.log('nothing to do');
    }
    res.status(200).send({status: 200, title: 'Finished'});
  }

  catch(e) {
    console.log(`An error occurred`);
    console.log(e);
    res.status(500).send({status: 500, title: 'unexpected error while processing request'});
  }
});

const notify = function(){
  return new Promise((resolve, reject) => {
    request
      .post('http://blockchain/notify')
      .on('response', response => resolve(response))
      .on('error', err => reject(err));
  });
};

console.log("Loaded blockchain informing service");
