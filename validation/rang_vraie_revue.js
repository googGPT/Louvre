// Rang de la vraie revue pour chaque article : node evalrank.js <index.html> <dossier données> <sample.json>
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
const common = html.slice(html.indexOf("/* ---------------- algorithme de ciblage"), html.indexOf("let VID = null;"));
const block = html.slice(html.indexOf("let VID = null;"), html.indexOf("async function refine(){"));
const S = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
process.chdir(process.argv[3]);
const J = JSON.parse(fs.readFileSync("journaux.json","utf8")).J; for (const j of J) j._p = 0;
const corpusRaw = JSON.parse(fs.readFileSync("corpus.json","utf8"));
let vals = {}; const $ = s => ({ get value(){ return vals[s]??""; }, set innerHTML(v){} });
const toast = ()=>{}, esc = x => String(x), rowHTML = () => "", sampleFn = null, refine = null;
const idxTxt = fs.existsSync("corpus-index.txt") ? fs.readFileSync("corpus-index.txt","utf8") : (fs.existsSync("corpus.bin") ? fs.readFileSync("corpus.bin").toString("base64") : ""); const fetch = async () => ({ json: async () => corpusRaw, text: async () => idxTxt });
let CORPUS = null;
const OUT = process.env.OUT;
let B2 = block; for (const [k,v] of Object.entries(JSON.parse(process.env.P||"{}"))) { const re = new RegExp("\\b"+k+" = [^,;]+"); if (!re.test(B2)) throw "param "+k; B2 = B2.replace(re, k+" = "+v); }
eval(common + B2.replace("LAST = { res: res.slice(0,40)", "ALL = res; LAST = { res: res.slice(0,40)") + `
var ALL;
(async () => { const ranks = [], rows = [];
 for (const x of S) {
  vals = { "#ct": x.t, "#ca": x.a, "#ck": x.k, "#cm": "", "#cw": "0", "#capc": "" };
  await runMatch();
  let r = (ALL||[]).findIndex(z => z.i === x.i); r = r < 0 ? 9999 : r + 1; ranks.push(r);
  rows.push({ i: x.i, journal: x.journal, t: x.t, rank: r, top1: (ALL&&ALL[0])?ALL[0].i:-1, top: (ALL||[]).slice(0,3).map(z=>J[z.i].t) });
 }
 const n = ranks.length, at = k => ranks.filter(r=>r<=k).length;
 const med = [...ranks].sort((a,b)=>a-b)[Math.floor(n/2)], mrr = ranks.reduce((s,r)=>s+1/r,0)/n;
 console.log("n="+n, "top1="+at(1), "top5="+at(5), "top10="+at(10), "top25="+at(25), "top100="+at(100), "médiane="+med, "MRR="+mrr.toFixed(3));
 if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 0));
})();`);
