const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname,'../helper.js'),'utf8');
let time = 0, values = [], clicked = false;
const dialog = {textContent:'退款金额(卡片) 退款金额(所属代理商头寸钱包-USD_USDT)'};
const context = {
  Date:{now:()=>time}, txt:e=>e.textContent, visible:()=>true,
  all:()=>values.map(value=>({value,type:'text'})), notices:[],
  refundDialog:()=>dialog, loading:()=>false, button:()=>({click:()=>{clicked=true}}),
  until:async fn=>{for(time=0;time<=20000;time+=100){values=time<3000?['83.01','']:['83.010','83.01'];const r=fn();if(r)return r;}return null;}
};
const funcs = vm.runInNewContext(source.slice(source.indexOf('  function normalizeAmount('),source.indexOf('  function rows()'))+'\n({normalizeAmount,refundAmounts,waitForAmounts})',context);
for(const v of ['', '0', '0.00', '-1', 'NaN', '1x']) assert.equal(funcs.normalizeAmount(v),null);
values=['83.010','83.01']; assert.equal(funcs.refundAmounts(dialog),'83.01');
values=['100.10433','100.1']; assert.equal(funcs.refundAmounts(dialog),'100.10');
values=['10.2846','10.28']; assert.equal(funcs.refundAmounts(dialog),'10.28');
values=['10.289','10.29']; assert.equal(funcs.refundAmounts(dialog),'10.29');
for (const [upper, lower, expected] of [
 ['0.1296','0.13','0.13'], ['0.1296','0.12','0.12'],
 ['0.1296','0.14',null], ['1.005','1.01','1.01'],
 ['9.999','10.00','10.00'], ['10.2846','10.29',null],
 ['0.001','0',null]
]) { values=[upper,lower]; assert.equal(funcs.refundAmounts(dialog),expected); }
values=['110.28','10.28']; assert.equal(funcs.refundAmounts(dialog),null);
values=['83.01','']; assert.equal(funcs.refundAmounts(dialog),null);
(async()=>{const result=await funcs.waitForAmounts(dialog);assert.equal(result.amount,'83.01');assert.ok(time>=4000);assert.equal(clicked,false);console.log('PASS: missing/zero/invalid/mismatched amounts blocked; equal decimals accepted only after load and stability');})().catch(e=>{console.error(e);process.exitCode=1});
