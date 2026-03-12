import fs from 'fs';
import readline from 'readline';

const sessionPath = process.argv[2] || 'captures/sessions/session-2026-03-10T10-24-41-759Z';
const snapshotsPath = `${sessionPath}/snapshots.ndjson`;

async function run() {
  const fileStream = fs.createReadStream(snapshotsPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const busStates = {}; 
  const empiricalSegments = {};
  const predictionErrors = {};

  for await (const line of rl) {
    if (!line.trim()) continue;
    const snapshot = JSON.parse(line);
    const time = new Date(snapshot.capturedAt).getTime();
    
    // Group snapshot by bus
    const groupedByBus = new Map();
    snapshot.arrivals.forEach((stationSnapshot) => {
        stationSnapshot.arrivals.forEach((arrival) => {
            const busId = String(arrival.IdBus);
            if (!groupedByBus.has(busId)) {
                groupedByBus.set(busId, []);
            }
            groupedByBus.get(busId).push({
                spRef: String(stationSnapshot.station.spRef),
                spName: stationSnapshot.station.spName,
                minutes: Number(arrival.Minutes),
                lineRef: arrival.LRef,
            });
        });
    });

    const activeBuses = [];
    groupedByBus.forEach((predictions, busId) => {
        const sortedPredictions = predictions.sort((a, b) => a.minutes - b.minutes);
        activeBuses.push({
            busId,
            nearestStop: sortedPredictions[0]
        });
    });

    for (const bus of activeBuses) {
      const id = bus.busId;
      const currentStop = bus.nearestStop?.spName;
      const currentEta = bus.nearestStop?.minutes;
      
      if (!busStates[id]) {
        busStates[id] = { 
            stop: currentStop, 
            stopStartTime: time,
            predictions: [] 
        };
      }
      
      const state = busStates[id];
      
      if (currentStop && currentEta !== undefined) {
         if (state.stop !== currentStop) {
             const durationSec = (time - state.stopStartTime) / 1000;
             const key = `${state.stop} -> ${currentStop}`;
             
             if (state.stop) {
                 if (!empiricalSegments[key]) empiricalSegments[key] = [];
                 empiricalSegments[key].push(durationSec);
                 
                 for (const pred of state.predictions) {
                     if (pred.stop === state.stop) {
                         const actualDurationSec = (time - pred.predictedAt) / 1000;
                         const errorSec = actualDurationSec - (pred.etaMinutes * 60);
                         if (!predictionErrors[pred.etaMinutes]) predictionErrors[pred.etaMinutes] = [];
                         predictionErrors[pred.etaMinutes].push(errorSec);
                     }
                 }
             }
             
             state.stop = currentStop;
             state.stopStartTime = time;
             state.predictions = [];
         }
         
         const lastPred = state.predictions[state.predictions.length - 1];
         if (!lastPred || lastPred.etaMinutes !== currentEta) {
             state.predictions.push({
                 stop: currentStop,
                 etaMinutes: currentEta,
                 predictedAt: time
             });
         }
      }
    }
  }

  const segmentAgg = [];
  for (const [key, times] of Object.entries(empiricalSegments)) {
      if (times.length < 2) continue;
      const sorted = times.sort((a,b)=>a-b);
      const valid = sorted.filter(t => t < 900); // Exclude > 15m terminal holds
      if (valid.length < 2) continue;
      
      const avg = valid.reduce((a,b)=>a+b,0) / valid.length;
      segmentAgg.push({
          key,
          samples: valid.length,
          avgSec: Math.round(avg),
          medianSec: Math.round(valid[Math.floor(valid.length/2)]),
          minSec: Math.round(valid[0]),
          maxSec: Math.round(valid[valid.length-1])
      });
  }
  segmentAgg.sort((a,b) => b.samples - a.samples);

  const errorAgg = [];
  for (const [eta, errors] of Object.entries(predictionErrors)) {
      const sorted = errors.sort((a,b)=>a-b);
      const valid = sorted.filter(e => Math.abs(e) < 1800);
      if (valid.length === 0) continue;
      const avgError = valid.reduce((a,b)=>a+b,0) / valid.length;
      errorAgg.push({
          etaMin: parseInt(eta),
          samples: valid.length,
          avgErrorSec: Math.round(avgError),
          medianErrorSec: Math.round(valid[Math.floor(valid.length/2)])
      });
  }
  errorAgg.sort((a,b) => a.etaMin - b.etaMin);

  const result = {
      note: "avgErrorSec: Negative means bus arrived SOONER than ETA predicted. Positive means it arrived LATER.",
      predictionAccuracyByEta: errorAgg,
      empiricalTravelTimesTop20: segmentAgg.slice(0, 20)
  };

  fs.writeFileSync('advanced-heuristics.json', JSON.stringify(result, null, 2));
  console.log("Analysis complete. Saved to advanced-heuristics.json");
}

run();
