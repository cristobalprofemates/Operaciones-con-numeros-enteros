// V19: exact division, fix denom==0 in builders, robust input, text keyboard, minimal parentheses
const STATE = {
  total: 15,
  current: 0,
  correct: 0,
  items: [],
  qStartMs: 0,
  attempt: 1,
  interactionIndex: 0,
  hints: { ast: null }
};

function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function clone(x){ return JSON.parse(JSON.stringify(x)); }

function evalNode(n){
  if(n.type==='num') return n.value;
  if(n.type==='group') return evalNode(n.child);
  const a = evalNode(n.left), b = evalNode(n.right);
  switch(n.op){ case '+':return a+b; case '-':return a-b; case '*':return a*b; case '/':return a/b; }
  return 0;
}
function prec(n){
  if(n.type==='num' || n.type==='group') return 3;
  if(n.op==='+'||n.op==='-') return 1;
  if(n.op==='*'||n.op==='/') return 2;
  return 0;
}
function needParens(child, parentOp, isRight){
  if(child.type==='group' || child.type==='num') return false;
  const pc = prec(child);
  if(parentOp==='/'){
    if(isRight) return true;
    return pc < 2;
  }
  const pp = (parentOp==='+'||parentOp==='-') ? 1 : 2;
  if(pc < pp) return true;
  if(pc===pp && parentOp==='-' && isRight) return true;
  return false;
}
function wrapDelim(kind, inner){
  if(kind==='[]') return `[\\,${inner}]`;
  if(kind==='{}') return `\\{\\,${inner}\\}`;
  return `(${inner})`;
}
function latexNode(n, parentOp=null, isRight=false){
  if(n.type==='num'){
    if(parentOp && (parentOp==='+'||parentOp==='-'||parentOp==='*'||parentOp==='/') && n.value < 0){
      return `\\left(${n.value}\\right)`;
    }
    return `${n.value}`;
  }
  if(n.type==='group'){
    const inner = latexNode(n.child, null, false);
    return wrapDelim(n.kind, inner);
  }
  const L = latexNode(n.left, n.op, false);
  const R = latexNode(n.right, n.op, true);
  if(n.op==='/'){
    const Ls = needParens(n.left, '/', false) ? `\\left(${L}\\right)` : L;
    const Rs = needParens(n.right, '/', true) ? `\\left(${R}\\right)` : R;
    return `${Ls} \\div ${Rs}`;
  }
  const Ls = needParens(n.left, n.op, false) ? `\\left(${L}\\right)` : L;
  const Rs = needParens(n.right, n.op, true) ? `\\left(${R}\\right)` : R;
  const opLatex = n.op==='*' ? '\\cdot' : n.op;
  return `${Ls} ${opLatex} ${Rs}`;
}

function reduceOnceNoFinal(n){
  if(n.type==='num') return {node:n, changed:false, final:false};
  if(n.type==='group'){
    const r = reduceOnceNoFinal(n.child);
    if(r.changed){ return {node:{type:'group', kind:n.kind, child:r.node}, changed:true, final:false}; }
    return {node:n, changed:false, final:false};
  }
  if(n.left.type==='num' && n.right.type==='num'){
    return {node:n, changed:false, final:true};
  }
  if(n.left.type!=='num'){
    const r = reduceOnceNoFinal(n.left);
    if(r.changed || r.final){ return {node:{type:'op', op:n.op, left:r.node, right:clone(n.right)}, changed:r.changed, final:false}; }
  }
  if(n.right.type!=='num'){
    const r = reduceOnceNoFinal(n.right);
    if(r.changed || r.final){ return {node:{type:'op', op:n.op, left:clone(n.left), right:r.node}, changed:r.changed, final:false}; }
  }
  return {node:n, changed:false, final:false};
}

// Helpers
function numLeaf(){
  let v = randInt(-10, 10);
  if(Math.random()<0.2 && v===0) v = 1;
  return {type:'num', value:v};
}
function opCombine(a, op, b){ return {type:'op', op, left:clone(a), right:clone(b)}; }

function buildDen_LMN(target){
  for(let tries=0; tries<200; tries++){
    const M=numLeaf(), N=numLeaf();
    const Lval = target + M.value - N.value;
    if(Lval>=-10 && Lval<=10){
      const L={type:'num', value:Lval};
      return { group: { type:'group', kind:'[]', child: opCombine(L,'-', opCombine(M,'-',N)) } };
    }
  }
  // fallback exacto: [ target - (0 - 0) ] = target
  return { group: { type:'group', kind:'[]', child: opCombine({type:'num', value:target}, '-', opCombine({type:'num', value:0}, '-', {type:'num', value:0})) } };
}

function buildDen_negH_plus_I_minus_J(target){
  for(let tries=0; tries<200; tries++){
    const H=numLeaf(), I=numLeaf();
    const Jval = -H.value + I.value - target;
    if(Jval>=-10 && Jval<=10){
      const J={type:'num', value:Jval};
      return { group: { type:'group', kind:'[]', child: opCombine({type:'num', value:-Math.abs(H.value)}, '+', opCombine(I,'-', J)) } };
    }
  }
  // fallback exacto: (-1) + (target - (-1)) = target
  return { group: { type:'group', kind:'[]', child: opCombine({type:'num', value:-1}, '+', opCombine({type:'num', value:target}, '-', {type:'num', value:-1})) } };
}

// Patterns
function pattern1(){ const A=numLeaf(),B=numLeaf(),C=numLeaf(),D=numLeaf();
  const inner=opCombine(B,'-',C);
  const grp={type:'group',kind:'[]',child:opCombine(A,'-',inner)};
  const right={type:'num',value:-Math.abs(D.value)};
  return opCombine(grp,'*',right); }

function pattern2_exact(){
  for(let tries=0; tries<200; tries++){
    const E = (Math.random()<0.5 ? 1 : -1) * randInt(2,10);
    const K = randInt(1,4);
    const B=numLeaf(), C=numLeaf(), D=numLeaf();
    const Aval = E*K + B.value - C.value + D.value;
    if(Aval>=-10 && Aval<=10){
      const A={type:'num', value:Aval};
      const lvl2=opCombine(C,'-',D);
      const lvl1={type:'group', kind:'[]', child: opCombine(B,'-',lvl2)};
      const grp={type:'group', kind:'{}', child: opCombine(A,'-',lvl1)};
      const right={type:'num', value:-Math.abs(E)};
      return opCombine(grp,'/', right);
    }
  }
  return pattern1();
}

function pattern3(){ const A=numLeaf(),B=numLeaf(),C=numLeaf(),D=numLeaf(),E=numLeaf();
  const lvl2=opCombine(D,'-',E);
  const lvl1={type:'group',kind:'[]',child:opCombine(C,'-',lvl2)};
  const grp={type:'group',kind:'{}',child:opCombine(B,'-',lvl1)};
  const left={type:'num',value:-Math.abs(A.value)};
  return opCombine(left,'+',grp); }

function pattern4(){ const F=numLeaf(),G=numLeaf(),H=numLeaf(),I=numLeaf(),J=numLeaf();
  const left=opCombine(F,'-',G);
  const right={type:'group',kind:'[]',child:opCombine({type:'num',value:-Math.abs(H.value)},'+',opCombine(I,'-',J))};
  return opCombine(left,'*',right); }

function pattern5_exact(){
  for(let tries=0; tries<200; tries++){
    const denVal = (Math.random()<0.5 ? 1 : -1) * randInt(2,10);
    const maxQ = Math.floor(10/Math.abs(denVal));
    if(maxQ < 1) continue;
    const q = randInt(1, Math.max(1, Math.min(4, maxQ)));
    const Kval = denVal * q;
    const den = buildDen_LMN(denVal).group;
    const num = {type:'num', value:-Math.abs(Kval)};
    return opCombine(num,'/', den);
  }
  return pattern4();
}

function pattern6(){ const P=numLeaf(),Q=numLeaf(),R=numLeaf(),S=numLeaf(),T=numLeaf();
  const grp={type:'group',kind:'{}',child:opCombine(P,'-',{type:'group',kind:'[]',child:opCombine(Q,'-',opCombine(R,'-',S))})};
  const right={type:'num',value:-Math.abs(T.value)};
  return opCombine(grp,'+',right); }

function pattern7(){ const U=numLeaf(),V=numLeaf(),W=numLeaf(),X=numLeaf(),Y=numLeaf(),Z=numLeaf();
  const left=opCombine(U,'-',V);
  const grp={type:'group',kind:'{}',child:opCombine(W,'-',{type:'group',kind:'[]',child:opCombine(X,'-',opCombine(Y,'-',Z))})};
  return opCombine(left,'+',grp); }

function pattern8(){ const AA=numLeaf(),AB=numLeaf(),AC=numLeaf(),AD=numLeaf(),AE=numLeaf();
  const left={type:'num',value:-Math.abs(AA.value)};
  const grp={type:'group',kind:'{}',child:opCombine(AB,'-',{type:'group',kind:'[]',child:opCombine(AC,'-',opCombine(AD,'-',AE))})};
  return opCombine(left,'*',grp); }

function pattern9_exact(){
  for(let tries=0; tries<200; tries++){
    const denVal = (Math.random()<0.5 ? 1 : -1) * randInt(2,10);
    const maxQ = Math.floor(10/Math.abs(denVal));
    if(maxQ < 1) continue;
    const q = randInt(1, Math.max(1, Math.min(4, maxQ)));
    const diff = denVal * q;
    const AG=numLeaf();
    const AFval = AG.value + diff;
    if(AFval>=-10 && AFval<=10){
      const AF={type:'num', value:AFval};
      const den = buildDen_negH_plus_I_minus_J(denVal).group;
      const nume = opCombine(AF,'-',AG);
      return opCombine(nume,'/', den);
    }
  }
  return pattern7();
}

function pattern10(){ const AK=numLeaf(),AL=numLeaf(),AM=numLeaf(),AN=numLeaf(),AO=numLeaf(),AP=numLeaf();
  const left={type:'group',kind:'{}',child:opCombine(AK,'-',opCombine(AL,'-',AM))};
  const right={type:'group',kind:'[]',child:opCombine(AN,'-',opCombine(AO,'-',AP))};
  return opCombine(left,'-',right); }

const PATTERNS = [pattern1, pattern2_exact, pattern3, pattern4, pattern5_exact, pattern6, pattern7, pattern8, pattern9_exact, pattern10];

// SCORM helpers
function toHHMMSS(seconds){ const s=Math.max(0,Math.floor(seconds)); const h=String(Math.floor(s/3600)).padStart(2,'0'); const m=String(Math.floor((s%3600)/60)).padStart(2,'0'); const sec=String(s%60).padStart(2,'0'); return `${h}:${m}:${sec}`;}
function nowHHMMSS(){ const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;}
function logInteraction({id, learner, correct, result, seconds, attempt}){
  const n=STATE.interactionIndex; const interId=`${id}_try${attempt}`;
  SCORM12.setValue(`cmi.interactions.${n}.id`, interId);
  SCORM12.setValue(`cmi.interactions.${n}.type`, "numeric");
  SCORM12.setValue(`cmi.interactions.${n}.time`, nowHHMMSS());
  SCORM12.setValue(`cmi.interactions.${n}.latency`, toHHMMSS(seconds));
  SCORM12.setValue(`cmi.interactions.${n}.student_response`, String(learner));
  SCORM12.setValue(`cmi.interactions.${n}.result`, result ? "correct" : "wrong");
  SCORM12.setValue(`cmi.interactions.${n}.correct_responses.0.pattern`, String(correct));
  STATE.interactionIndex++;
}
function saveStats(){
  const score=Math.round((STATE.correct/STATE.total)*100);
  const payload=JSON.stringify({ correct:STATE.correct, total:STATE.total, score });
  SCORM12.setValue("cmi.suspend_data", payload);
  SCORM12.setValue("cmi.core.score.raw", String(score));
  SCORM12.commit();
}

// Input parsing
function normalizeIntInput(s){
  return (s||'')
    .replace(/\s+/g, '')
    .replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-') // distintos "menos" -> '-'
    .replace(/^\+/, '');
}
function parseIntegerStrict(s){
  const t = normalizeIntInput(s);
  if(!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

// Flow
function render(){
  const q=document.getElementById('q'); const idx=document.getElementById('idx'); const total=document.getElementById('total');
  const input=document.getElementById('answer'); const btn=document.getElementById('btn'); const hintsDiv=document.getElementById('hints');
  idx.textContent=STATE.current+1; total.textContent=STATE.total;

  if(!STATE.items[STATE.current]){
    const ast=clone(PATTERNS[Math.floor(Math.random()*PATTERNS.length)]());
    const val = Math.round(evalNode(ast)); // exacto por construcción
    STATE.items[STATE.current]={ ast, value: val };
  }
  const latex=latexNode(STATE.items[STATE.current].ast);
  q.innerHTML=`\\( ${latex} \\)`;
  if(window.MathJax && MathJax.typesetPromise){ MathJax.typesetPromise([q]); }

  input.value=""; input.focus(); btn.disabled=false;
  STATE.qStartMs=performance.now(); STATE.attempt=1;
  STATE.hints.ast=clone(STATE.items[STATE.current].ast);
  hintsDiv.querySelectorAll('.hint-step')?.forEach(el=>el.remove());
}

function showHint(){
  const hintsDiv=document.getElementById('hints');
  const before=latexNode(STATE.hints.ast);
  const r=reduceOnceNoFinal(STATE.hints.ast);
  if(r.changed){
    const after=latexNode(r.node);
    const stepEl=document.createElement('div');
    stepEl.className='hint-step';
    stepEl.innerHTML=`\\( ${before} \\Rightarrow ${after} \\)`;
    hintsDiv.appendChild(stepEl);
    STATE.hints.ast=r.node;
    if(window.MathJax && MathJax.typesetPromise){ MathJax.typesetPromise([hintsDiv]); }
  }else{
    const note=document.createElement('div');
    note.className='hint-step';
    note.innerHTML=`<em>Ya solo queda el último paso: calcula el resultado numérico.</em>`;
    hintsDiv.appendChild(note);
  }
}

function start(){
  if(SCORM12.init()){ SCORM12.setValue("cmi.core.lesson_status","incomplete"); }
  STATE.current=0; STATE.correct=0; STATE.items=[]; STATE.interactionIndex=0; render();
}

function check(){
  const input=document.getElementById('answer'); const feedback=document.getElementById('feedback'); const btn=document.getElementById('btn'); btn.disabled=true;
  const parsed = parseIntegerStrict(input.value);
  if(parsed===null){
    feedback.innerHTML = `<span class="ko">Introduce un número <strong>entero</strong>.</span>`;
    btn.disabled=false; input.focus(); return;
  }
  const expected=STATE.items[STATE.current].value;
  const ok=(parsed===expected);
  if(ok) STATE.correct++;

  const seconds=(performance.now()-STATE.qStartMs)/1000;
  const id=`q${STATE.current+1}`;
  logInteraction({ id, learner: parsed, correct: expected, result: ok, seconds, attempt: STATE.attempt });
  saveStats();

  if(ok){
    feedback.innerHTML = `<span class="ok">¡Correcto!</span>`;
    setTimeout(()=>{
      feedback.innerHTML='';
      STATE.current++;
      if(STATE.current<STATE.total){ render(); } else { finish(); }
    }, 600);
  }else{
    feedback.innerHTML = `<span class="ko">No es correcto. Inténtalo de nuevo o pulsa <em>Mostrar pista</em>.</span>`;
    STATE.attempt++; STATE.qStartMs=performance.now();
    setTimeout(()=>{ input.value=''; input.focus(); btn.disabled=false; }, 300);
  }
}

function finish(){
  const score=Math.round((STATE.correct/STATE.total)*100);
  const summary=`Has acertado ${STATE.correct} de ${STATE.total}. Puntuación: ${score}%`;
  document.getElementById('container').innerHTML=`
    <h2>Resultado</h2>
    <p>${summary}</p>
    <button id="retry" class="primary">Volver a intentar</button>`;
  const passed=score>=70;
  SCORM12.setValue("cmi.core.score.raw", String(score));
  SCORM12.setValue("cmi.core.lesson_status", passed ? "passed" : "failed");
  saveStats();
  document.getElementById('retry').addEventListener('click', ()=>{ location.reload(); });
}

window.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('btn').addEventListener('click', check);
  document.getElementById('hintBtn').addEventListener('click', showHint);
  document.getElementById('answer').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ check(); } });
  start();
});
window.addEventListener('beforeunload', ()=>{ SCORM12.finish(); });
