const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname,'../helper.js'),'utf8');
const code = source.slice(source.indexOf('  function chooseAction('),source.indexOf('  function pagination('));
const choose = vm.runInNewContext(code + '\nchooseAction;');
function simulate(failed, removeSuccess) {
  let data = Array.from({length:93},(_,i)=>({key:String(i+1)}));
  const seen = new Set();
  let page=1, passWork=0, moves=0;
  for(let step=0;step<1000;step++) {
    const items=data.slice((page-1)*10,page*10);
    const action=choose(items,seen,page,page*10<data.length,passWork);
    if(action.type==='done') {
      assert.equal(seen.size,93,'must attempt every record despite shifting boundaries');
      assert.ok(moves>0,'must navigate pages');
      return;
    }
    if(action.type==='next') {page++;moves++;continue;}
    if(action.type==='rewind') {page=1;passWork=0;continue;}
    const key=action.row.key;
    assert.ok(!seen.has(key),'must not submit a record twice');
    seen.add(key);passWork++;
    if(removeSuccess && !failed.has(key)) {
      data=data.filter(e=>e.key!==key);
      page=Math.min(page,Math.max(1,Math.ceil(data.length/10)));
    }
  }
  assert.fail('must terminate');
}
simulate(new Set(),false); // successful rows remain in the current filter
simulate(new Set(Array.from({length:93},(_,i)=>String(i+1))),true); // every row errors
simulate(new Set(Array.from({length:17},(_,i)=>String(i+1))),true); // errors pin earlier pages while successes shrink later pages
assert.equal(choose([{key:'replacement'}],new Set(['old']),1,true,1).type,'process');
assert.equal(choose([],new Set(),1,false,0).type,'done');
console.log('PASS: static pages, all errors, shrinking pages, replacement rows, empty list');
