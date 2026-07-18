import { readFileSync } from "node:fs";
import { parseMat, extractCwru } from "../src/core/signal/mat";
import { analyze } from "../src/core/analyze";
const truth: Record<string,string> = { "97":"healthy", "105":"bearing_inner", "118":"bearing_ball", "130":"bearing_outer" };
let ok=0;
for (const id of ["97","105","118","130"]) {
  const buf = readFileSync(`public/data/cwru/${id}.mat`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength) as ArrayBuffer;
  const cw = extractCwru(parseMat(ab));
  const r = analyze({ samples: cw.samples, sampleRate: 12000, rpm: cw.rpm??1797, unit:"acceleration", accelInG:true, bearingDesignation:"6205-2RS JEM SKF" });
  const hit = r.diagnosis.top.fault === truth[id]; if(hit)ok++;
  console.log(`${id} truth=${truth[id].padEnd(14)} pred=${r.diagnosis.top.fault.padEnd(14)} ${hit?"OK":"XX"} score=${r.diagnosis.top.score.toFixed(2)} 2nd=${r.diagnosis.ranked[1].fault}:${r.diagnosis.ranked[1].score.toFixed(2)}`);
}
console.log(`CWRU real: ${ok}/4`);
