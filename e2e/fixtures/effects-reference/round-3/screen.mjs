import {initialState, installEcho, updateEcho} from './phosphor-echo.mjs';
const root = document.querySelector('#screen');
const filter = installEcho(document.querySelector('#echo-defs'));
let state = initialState();
state.mode = new URLSearchParams(location.search).get('mode') === 'off' ? 'off' : 'echo';
function paintFrame(svg) {
  const {width:w,height:h}=svg.getBoundingClientRect(),cut=+svg.dataset.frame,bar=+(svg.dataset.accent||0);
  if(!w||!h)return;
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const x=bar||1;
  const part=svg.dataset.echoFor;
  // A filled footprint drives the rear copy, but is never painted as the front.
  // The shared filter outputs only the portion outside this same footprint.
  const silhouette=`M0 0H${w}V${h-cut}L${w-cut} ${h}H0Z`;
  svg.innerHTML=`<path class="echo-source" data-part="${part}" data-active="${!!state.parts[part]}" d="${silhouette}" fill="currentColor"/>`+
    `<path class="foreground-stroke" d="M${x} 1H${w-1}V${h-cut}L${w-cut} ${h-1}H${x}Z" fill="none" stroke="currentColor" stroke-width="2"/>`+
    (bar?`<path class="foreground-stroke" d="M1 1H${bar}V${h-1}H1Z" fill="currentColor" fill-opacity=".4" stroke="currentColor" stroke-width="2"/>`:'');
}
const observer=new ResizeObserver(entries=>entries.forEach(e=>paintFrame(e.target)));
document.querySelectorAll('[data-frame]').forEach(svg=>observer.observe(svg));
function apply(next) {
  state={...state,...next,parts:{...state.parts,...next.parts}};
  state.mode=state.mode==='off'?'off':'echo';
  root.dataset.mode=state.mode;
  updateEcho(filter,state);
  document.querySelectorAll('[data-part]').forEach(e=>{
    e.dataset.active=String(!!state.parts[e.dataset.part]);
    e.dataset.outline=String(state.outline&&!!state.parts[e.dataset.part]);
  });
  document.querySelectorAll('[data-echo-for]').forEach(e=>e.dataset.outline=String(state.outline&&!!state.parts[e.dataset.echoFor]));
  parent.postMessage({type:'echo-ready',checks:checks()},location.origin);
}
function checks() {
  return {width:innerWidth,height:innerHeight,mode:root.dataset.mode,
    filterDefinitions:document.querySelectorAll('filter').length,
    cardFilter:getComputedStyle(document.querySelector('.form-card')).filter,
    nestedFiltered:[...document.querySelectorAll('.card-content,.card-content *,.back-icon,.cta-label,.cta-surface,.foreground-stroke,.heading-foreground,.frame-art')].filter(e=>getComputedStyle(e).filter!=='none').length,
    selected:[...document.querySelectorAll('[data-part][data-active=true]')].map(e=>e.dataset.part),
    overflow:document.documentElement.scrollWidth>innerWidth};
}
addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='echo-settings')apply(e.data.state)});
document.querySelector('#intensity').addEventListener('input',e=>document.querySelector('#intensity-value').textContent=e.target.value);
document.querySelectorAll('.action-shell,.focus-action,.recovery').forEach(b=>b.addEventListener('click',()=>{document.querySelector('.preview-message').hidden=false}));
addEventListener('resize',()=>apply({}));
apply({});
