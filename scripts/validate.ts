/* Runs the validation suite and prints the confusion matrix. Usage: npx tsx scripts/validate.ts */
import { runValidation, VALIDATION_FAULTS } from "../src/core/validation/suite";

const perClass = Number(process.argv[2] ?? 8);
const { confusion } = runValidation(perClass);

const short: Record<string, string> = {
  healthy: "HLT",
  unbalance: "UNB",
  misalignment: "MIS",
  looseness: "LOO",
  bearing_outer: "BPFO",
  bearing_inner: "BPFI",
  bearing_ball: "BSF",
  cavitation: "CAV",
  oil_whirl: "WHRL",
};

const labels = VALIDATION_FAULTS;
const header = ["truth\\pred".padEnd(12), ...labels.map((l) => short[l].padStart(5))].join(" ");
console.log("\n" + header);
confusion.matrix.forEach((row, t) => {
  const cells = row.map((v, p) => {
    const s = String(v).padStart(5);
    return t === p && v > 0 ? `\x1b[32m${s}\x1b[0m` : v > 0 ? `\x1b[31m${s}\x1b[0m` : s;
  });
  console.log(short[labels[t]].padEnd(12) + " " + cells.join(" "));
});

console.log("\nPer-class:");
for (const l of labels) {
  const m = confusion.perClass[l];
  console.log(
    `  ${l.padEnd(16)} precision=${m.precision.toFixed(2)}  recall=${m.recall.toFixed(2)}  n=${m.support}`,
  );
}
console.log(`\nOverall accuracy: ${(confusion.accuracy * 100).toFixed(1)}%  (n=${perClass * labels.length})\n`);
