import {initialClock,advanceClock,grainSeed,MOTION_DEFAULTS} from './motion-clock.mjs';
import {PRESETS,createGlassEffect} from './glass-effect.mjs';
import {WORKING_SESSION} from './working-session.mjs';
const W=390,H=844;

let state={...PRESETS.selected,...MOTION_DEFAULTS,echo:true,colorProtect:true,reduceMotion:false,effectsOff:false,verticalLine:false,mode:'glass'},activePreset='selected',compare=false,exportURL;
// Keep the owner's working controls through code refreshes; approved defaults
// remain separately owned in PRESETS and the effects index.
state={...state,...WORKING_SESSION.settings};compare=WORKING_SESSION.compare;activePreset='custom';
try{
 const draft=JSON.parse(localStorage.getItem('clear-crt-study-draft-v1')||'null');
 if(draft?.settings){
  for(const key of Object.keys(state))if(typeof draft.settings[key]===typeof state[key])state[key]=draft.settings[key];
  compare=!!draft.compare;
 }
}catch{}
state.cycleSeconds=Math.max(.1,Math.min(180,Number(state.cycleSeconds)||60));
try{
 const comfort=JSON.parse(localStorage.getItem('clear-crt-study-comfort-v1')||'{}');
 for(const key of ['reduceMotion','effectsOff'])if(typeof comfort[key]==='boolean')state[key]=comfort[key];
}catch{}
const $=s=>document.querySelector(s);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let clock=initialClock(),raf=0,lastTime=0,lastRender=0,lastPublish=0;
const controls=[
 ['motion-controls','cycleSeconds','Drift cycle',.1,180,.1,v=>Number(v.toFixed(1))+' seconds'],
 ['line-controls','lineWidth','Line width',0,6,.1,v=>v===0?'Off':v.toFixed(1)+' px'],
 ['line-controls','lineContrast','Line contrast',0,1,.01,v=>Math.round(v*100)+'%'],
 ['line-controls','curvature','Line curvature',0,3,.05,v=>v===0?'Straight':v.toFixed(2)],
 ['edge-controls','edgeBlur','Edge softness',0,4,.05,v=>v.toFixed(2)+' px'],
 ['edge-controls','edgeWidth','Soft edge reach',.05,.6,.01,v=>Math.round(v*100)+'%'],
 ['vignette-controls','vignettingAlpha','Darkening',0,1,.01,v=>Math.round(v*100)+'%'],
 ['vignette-controls','vignetting','Reach',0,.6,.01,v=>Math.round(v*100)+'%'],
 ['vignette-controls','vignettingBlur','Feather',.02,1,.01,v=>Math.round(v*100)+'%'],
 ['noise-controls','noise','Grain',0,.3,.005,v=>Math.round(v*1000)/10+'%'],
 ['noise-controls','noiseSize','Grain size',1,4,.25,v=>v.toFixed(2)+' px'],
 ['noise-controls','grainSoftness','Grain feathering',.01,.99,.01,v=>v.toFixed(2)],
 ['grain-motion-controls','grainRate','Grain refresh',.5,6,.5,v=>v.toFixed(1)+' / second']
];
for(const [group,id,label,min,max,step,format] of controls){
 const row=document.createElement('div');row.className='control';
 row.innerHTML=`<label for="${id}">${label}<output id="${id}-out"></output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
 $('#'+group).append(row);
 $('#'+id).addEventListener('input',e=>{state[id]=+e.target.value;activePreset='custom';apply()});
}
const exactCycle=document.createElement('div');
exactCycle.className='cycle-entry';
exactCycle.innerHTML='<label for="cycleSecondsExact">Seconds per cycle</label><input id="cycleSecondsExact" type="number" min="0.1" max="180" step="0.1"><small>Lower values move faster.</small>';
$('#motion-controls').append(exactCycle);
$('#cycleSecondsExact').addEventListener('input',e=>{
 const value=e.target.valueAsNumber;
 if(Number.isFinite(value)&&value>=.1&&value<=180){state.cycleSeconds=value;activePreset='custom';apply()}
});
$('#cycleSecondsExact').addEventListener('change',()=>{$('#cycleSecondsExact').value=state.cycleSeconds});

let app,sprite,crt,edge,textures,glass;
function canMove(){
 return !!app&&!!crt&&state.mode==='glass'&&!state.effectsOff&&!state.reduceMotion&&!document.hidden&&!reducedMotion.matches&&
  ((state.animate&&state.lineWidth>0&&state.lineContrast>0)||(state.grainAnimate&&state.noise>0));
}
function publishClock(){
 $('#surface').dataset.motion=JSON.stringify({phase:clock.phase,grainIndex:clock.grainIndex,grainSeed:grainSeed(clock),running:canMove(),reducedMotion:reducedMotion.matches});
}
function motionStatus(){
 let text=state.animate?`One drift cycle every ${state.cycleSeconds} ${state.cycleSeconds===1?'second':'seconds'}.`:'Lines are still.';
 text+=state.grainAnimate?` Grain refreshes ${state.grainRate} ${state.grainRate===1?'time':'times'} per second.`:' Grain stays still.';
 if(state.effectsOff)text='Study effects are off. Animation is stopped.';
 else if(reducedMotion.matches||state.reduceMotion)text='Motion paused for your reduced-motion preference.';
 else if(document.hidden)text='Motion pauses while this tab is hidden.';
 else if(state.mode==='current')text='The current-line reference is still.';
 $('#motion-status').textContent=text;
}
function syncMotion(){
 motionStatus();
 if(canMove()&&!raf){lastTime=0;lastRender=0;raf=requestAnimationFrame(tick)}
 else if(!canMove()&&raf){cancelAnimationFrame(raf);raf=0;lastTime=0}
 if(crt)publishClock();
}
function tick(now){
 raf=0;
 if(!canMove()){syncMotion();return}
 const dt=lastTime?Math.min((now-lastTime)/1000,.1):0;
 lastTime=now;
 clock=advanceClock(clock,dt,state);
 if(now-lastRender>=1000/30){
  glass.setMotion(clock.phase,grainSeed(clock));app.render();lastRender=now;
  if(now-lastPublish>=250){publishClock();lastPublish=now}
 }
 raf=requestAnimationFrame(tick);
}
function apply(){
 state.grainSoftness=Math.max(.01,Math.min(.99,Number(state.grainSoftness)||.01));
 for(const [,id,,, , ,format] of controls){$('#'+id).value=state[id];$('#'+id+'-out').textContent=format(state[id])}
 for(const id of ['echo','verticalLine','grainAnimate','colorProtect','effectsOff'])$('#'+id).checked=state[id];
 $('#reduceMotion').checked=state.reduceMotion||reducedMotion.matches;
 $('#reduceMotion').disabled=reducedMotion.matches;
 document.querySelectorAll('[data-motion]').forEach(b=>b.setAttribute('aria-pressed',String(state.animate===(b.dataset.motion==='drift'))));
 $('#grainRate').disabled=!state.grainAnimate;
 $('#cycleSeconds').disabled=!state.animate;
 $('#cycleSecondsExact').disabled=!state.animate;
 $('#cycleSecondsExact').value=state.cycleSeconds;
 $('#baseline').hidden=!compare;
 $('.stage').classList.toggle('comparing',compare);
 $('#compare').setAttribute('aria-pressed',String(compare));
 document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(activePreset===b.dataset.preset)));
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(state.mode===b.dataset.mode)));
 $('#preview-caption').innerHTML=state.effectsOff?'Plain specimen <span>Study effects off</span>':state.mode==='current'?`Reference <span>Current DS line recipe${state.echo?' + Echo':''}</span>`:`Proposed <span>CRT glass${state.echo?' + Phosphor Echo':''}</span>`;
 $('#treatment-note').textContent=state.mode==='current'?'The current foundation’s straight scanline recipes on the preserved screen specimen.':'Curved scanlines, a soft edge, and a gentle vignette over the whole image.';
 if(app&&sprite&&crt&&edge&&textures){
  sprite.texture=state.effectsOff?textures.sharp:state.mode==='current'?(state.echo?textures.current:textures.currentSharp):(state.echo?textures.echo:textures.sharp);
  glass.update(state,sprite.texture);
  sprite.filters=state.effectsOff||state.mode==='current'?[]:glass.filters;
  glass.setMotion(clock.phase,grainSeed(clock));app.render();
  $('#renderer-status').textContent=state.effectsOff?'Plain specimen · study filters bypassed':state.mode==='current'?'Current CSS line recipe · preserved screen specimen':'PixiJS CRTFilter · Phosphor Echo → CRT → soft edges';
  $('#surface').dataset.state=JSON.stringify(state);
  $('#surface').dataset.engine='PixiJS CRTFilter';
  $('#surface').dataset.scanlineLayers=state.effectsOff?'none':state.mode==='current'?'current CSS only':'CRT only';
  $('#surface').dataset.filterPasses=state.effectsOff||state.mode==='current'?'0':'2';
 }
 if(exportURL)URL.revokeObjectURL(exportURL);
 exportURL=URL.createObjectURL(new Blob([JSON.stringify({study:'CLEAR CRT glass motion 02',settings:state,phosphorEcho:{opacity:.29,blur:3.2,x:-4.7,y:5.64},pipeline:'Echo composed first, CRT scanlines and vignette, then edge softness',scope:'isolated visual study; no application integration'},null,2)],{type:'application/json'}));
 $('#export').href=exportURL;
 try{localStorage.setItem('clear-crt-study-draft-v1',JSON.stringify({settings:state,compare}))}catch{}
 syncMotion();
}
for(const id of ['echo','verticalLine','grainAnimate','colorProtect','reduceMotion','effectsOff'])$('#'+id).addEventListener('change',e=>{
 state[id]=e.target.checked;
 if(id==='reduceMotion'||id==='effectsOff')try{localStorage.setItem('clear-crt-study-comfort-v1',JSON.stringify({reduceMotion:state.reduceMotion,effectsOff:state.effectsOff}))}catch{}
 apply();
});
document.querySelectorAll('[data-motion]').forEach(b=>b.addEventListener('click',()=>{state.animate=b.dataset.motion==='drift';apply()}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;apply()}));
function preset(name){state={...state,...PRESETS[name],mode:'glass',verticalLine:false};activePreset=name;apply()}
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
$('#reset').addEventListener('click',()=>{state.echo=true;state.animate=true;state.grainAnimate=false;state.cycleSeconds=60;state.grainRate=2;clock=initialClock();preset('selected')});
$('#compare').addEventListener('click',()=>{compare=!compare;apply()});
apply();
try{
 app=new PIXI.Application();
 await app.init({width:W,height:H,resolution:1,antialias:false,autoStart:false,preference:'webgl',background:'#150a12',preserveDrawingBuffer:true});
 const images=await Promise.all(['echo-clean','sharp-clean','current-lines','current-lines-sharp'].map(name=>PIXI.Assets.load(`assets/${name}.jpg`)));
 textures={echo:images[0],sharp:images[1],current:images[2],currentSharp:images[3]};
 sprite=new PIXI.Sprite(textures.echo);sprite.width=W;sprite.height=H;app.stage.addChild(sprite);
 glass=createGlassEffect(PIXI,{texture:textures.echo,width:W,height:H,values:state});
 ({crt,edge}=glass);
 sprite.filterArea=new PIXI.Rectangle(0,0,W,H);
 $('#fallback').remove();$('#surface').append(app.canvas);apply();
 reducedMotion.addEventListener('change',apply);
 document.addEventListener('visibilitychange',syncMotion);
}catch(error){$('#renderer-status').textContent='The CRT renderer could not start. The preserved screen is shown instead.';console.error(error)}
