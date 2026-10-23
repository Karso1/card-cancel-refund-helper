const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../helper.js'),'utf8');
const code=source.slice(source.indexOf('  function button('),source.indexOf('  function rows('));
function element(text,{standard=false,blocked=false,children=[]}={}) {
  return {text,standard,blocked,children,
    matches:s=>false,
    closest(s){return s.startsWith('[disabled]') ? (this.blocked ? {} : null) : (this.standard ? this : null);},
    contains:e=>children.includes(e)};
}
const button=vm.runInNewContext(code+'\nbutton;',{
  txt:e=>e.text,visible:()=>true,enabled:e=>!e.blocked,
  all:(s,r)=>r.children.filter(e=>s==='div,span' ? !e.standard : e.standard)
});
const native=element('确定',{standard:true});
assert.equal(button(element('发起退款',{children:[native]}),'确定'),native);
const custom=element('确定');
assert.equal(button(element('发起退款',{children:[custom]}),'确定'),custom);
const disabled=element('确定',{blocked:true});
assert.equal(button(element('发起退款',{children:[disabled]}),'确定'),null);
assert.equal(button(element('其他弹窗',{children:[custom]}),'确定'),null);
assert.equal(button(element('发起退款',{children:[custom,element('确定')]}),'确定'),null);
assert.equal(button(element('发起退款',{children:[element('不确定')]}),'确定'),null);
console.log('PASS: native/custom agree, disabled, wrong dialog, ambiguous labels, exact label');
