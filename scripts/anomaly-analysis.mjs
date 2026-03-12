import fs from 'fs';
import readline from 'readline';

const sessionPath = process.argv[2] || 'captures/sessions/session-2026-03-10T10-24-41-759Z';
const snapshotsPath = `${sessionPath}/snapshots.ndjson`;

async function run() {
  const fileStream = fs.createReadStream(snapshotsPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const busStates = {}; 
  const terminalHolds = {};
  const etaFluctuations = {};
  const ghostSignatures = {};

  let totalSnapshots = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const snapshot = JSON.parse(line);
    const time = new Date(snapshot.capturedAt).getTime();
    totalSnapshots++;
    
    // Group snapshot by bus
    const groupedByBus = new Map();
    snapshot.arrivals.forEach((stationSnapshot) => {
        stationSnapshot.arrivals.forEach((arrival) => {
            const busId = String(arrival.IdBus);
            if (!groupedByBus.has(busId)) groupedByBus.set(busId, []);
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
            lineRef: sortedPredictions[0]?.lineRef,
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
            eta: currentEta,
            etaHistory: [],
            freezeCount: 0
        };
      }
      
      const state = busStates[id];
      
      if (currentStop && currentEta !== undefined) {
         // Stop transition logic
         if (state.stop !== currentStop) {
             const durationSec = (time - state.stopStartTime) / 1000;
             
             // Detect long terminal holds (over 10 minutes)
             if (durationSec > 600) {
                 if (!terminalHolds[state.stop]) terminalHolds[state.stop] = [];
                 terminalHolds[state.stop].push({
                     busId: id,
                     lineRef: bus.lineRef,
                     durationMinutes: Math.round(durationSec / 60),
                     terminalEta: state.eta
                 });
             }
             
             state.stop = currentStop;
             state.stopStartTime = time;
             state.etaHistory = [];
             state.freezeCount = 0;
         }

         // Same-stop ETA fluctuation logic
         if (state.stop === currentStop) {
             if (state.eta !== currentEta) {
                 const delta = currentEta - state.eta;
                 
                 // If the ETA INCREASES, track it
                 if (delta > 0) {
                     if (!etaFluctuations[state.stop]) etaFluctuations[state.stop] = { increases: 0, jumps: 0 };
                     etaFluctuations[state.stop].increases++;
                 }
                 
                 // If the ETA JUMPS wildly (more than 3 mins at once)
                 if (Math.abs(delta) >= 3) {
                     if (!etaFluctuations[state.stop]) etaFluctuations[state.stop] = { increases: 0, jumps: 0 };
                     etaFluctuations[state.stop].jumps++;
                 }

                 state.etaHistory.push({ from: state.eta, to: currentEta, delta });
                 state.eta = currentEta;
                 state.freezeCount = 0;
             } else {
                 state.freezeCount++;
             }

             // Detect ghost signatures (Frozen at the same stop with exact same ETA for > 50 polls / ~12.5 mins)
             if (state.freezeCount > 50) {
                 const sigKey = `${id}-${state.stop}-${currentEta}m`;
                 if (!ghostSignatures[sigKey]) ghostSignatures[sigKey] = {
                     busId: id,
                     stop: state.stop,
                     frozenEta: currentEta,
                     maxFreezePolls: 0
                 };
                 if (state.freezeCount > ghostSignatures[sigKey].maxFreezePolls) {
                     ghostSignatures[sigKey].maxFreezePolls = state.freezeCount;
                 }
             }
         }
      }
    }
  }

  // Aggregate Terminal Holds
  const aggregatedHolds = [];
  for (const [stop, holds] of Object.entries(terminalHolds)) {
      aggregatedHolds.push({
          stop,
          numberOfHoldsDetected: holds.length,
          avgHoldMinutes: Math.round(holds.reduce((acc, h) => acc + h.durationMinutes, 0) / holds.length),
          maxHoldMinutes: Math.max(...holds.map(h => h.durationMinutes)),
          predominantFrozenEta: holds.map(h => h.terminalEta).sort((a,b) =>
            holds.filter(v => v.terminalEta===a).length - holds.filter(v => v.terminalEta===b).length
          ).pop()
      });
  }

  const result = {
      totalSnapshotsAnalyzed: totalSnapshots,
      terminalHolds: aggregatedHolds.sort((a, b) => b.maxHoldMinutes - a.maxHoldMinutes),
      ghostSignaturesObserved: Object.values(ghostSignatures).sort((a, b) => b.maxFreezePolls - a.maxFreezePolls).map(g => ({
          ...g,
          estimatedFrozenMinutes: Math.round((g.maxFreezePolls * 15) / 60)
      })),
      mostVolatileStops: Object.entries(etaFluctuations).map(([stop, data]) => ({ stop, ...data })).sort((a, b) => (b.increases + b.jumps) - (a.increases + a.jumps)).slice(0, 10)
  };

  fs.writeFileSync('advanced-anomalies.json', JSON.stringify(result, null, 2));
  console.log("Analysis complete. Saved to advanced-anomalies.json");
}

run();