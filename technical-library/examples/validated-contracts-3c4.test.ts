import { acceptedLabels, authorizeProjectEdit, getPublicProject, pageOffset, parseCreate, sortScores, UI_POLICY } from "./validated-contracts-3c4";
function eq<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(`${message}: ${JSON.stringify(actual)}`);
}
async function main() {
  const source = [9, 2, 5];
  eq(sortScores(source), [9, 5, 2], "sort");
  eq(source, [9, 2, 5], "readonly input");
  eq(UI_POLICY.maxUsers, 25, "policy");
  eq(pageOffset(1, 20), 0, "page one");
  eq(pageOffset(4, 20), 60, "page four");
  for (const [a,b] of [[0,20],[1,0],[-1,15],[1,101]]) {
    try { pageOffset(a,b); throw new Error("expected rejection"); }
    catch(e) { if ((e as Error).message==="expected rejection") throw e; }
  }
  eq(acceptedLabels([{ label: "cat", score: 0.95 }, { label: "tree", score: 0.2 },{label:"bad",score:NaN}]), ["cat"], "threshold");
  eq(parseCreate({ title: " My task " }), { title: "My task" }, "trim");
  for (const input of [null,[],{ title: " " },{ title: 4 },{ title: "x".repeat(121) }]) eq(parseCreate(input), null, "invalid payload");
  eq(authorizeProjectEdit({id:"member"},"member"),true,"owner");
  eq(authorizeProjectEdit({id:"other"},"member"),false,"other");
  eq(authorizeProjectEdit(null,"member"),false,"anonymous");
  let called=0;
  const repo={async findPublicById(id:string){called++;return {id,title:"Public"};}};
  eq(await getPublicProject(repo,"INVALID%"),null,"invalid ID");
  eq(called,0,"repository not called");
  eq(await getPublicProject(repo,"good-project"),{id:"good-project",title:"Public"},"valid ID");
  eq(called,1,"repository called");
  console.log("PASS 3C4: 23 assertions and invalid-path checks (TypeScript strict, Node 22)");
}
void main().catch(e=>{throw e;});