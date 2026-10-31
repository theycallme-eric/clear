/**
 * TASK-201 — serving the preserved checkpoint read-only, and the exact
 * reference renderer: the preserved `createGlassEffect` pass (CRTFilter, then
 * the edge pass) in the vendored PixiJS, exactly as `study.mjs` initialises it.
 *
 * Files are answered by route interception straight from the checkpoint
 * directory; nothing is written anywhere. Only the named reference files are
 * served.
 */
import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'

import { REFERENCE_FILES, type Proof } from './fixture'

export const PREFIX = '/__crt-proof/'
export const SPECIMEN_URL = `${PREFIX}ref/${REFERENCE_FILES.specimen}`
export const CLOCK_URL = `${PREFIX}ref/${REFERENCE_FILES.motionClock}`

const MIME: Record<string, string> = { mjs: 'text/javascript', js: 'text/javascript', jpg: 'image/jpeg', png: 'image/png', html: 'text/html' }

/** The variants of the preserved pass. Each sub-test switches whole operations off; no CRT number changes. */
export type ReferenceVariant = 'source' | 'vignette' | 'blur' | 'protect' | 'grain' | 'line' | 'scaling' | 'full'

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:black}</style></head><body>
<script src="${PREFIX}ref/${REFERENCE_FILES.pixi}"></script><script src="${PREFIX}ref/${REFERENCE_FILES.filters}"></script>
<script type="module">
import {createGlassEffect} from '${PREFIX}ref/${REFERENCE_FILES.glassEffect}';
const OFF={blur:['protect','grain','line'],protect:['blur','grain','line'],grain:['blur','protect','line'],line:['blur','protect','grain'],scaling:['blur','protect']};
const EDGE_ONLY=['blur','grain','line','scaling'];
window.__renderReference=async({image,settings,phase,seed,variant,width,height})=>{
 const app=new PIXI.Application();
 await app.init({width,height,resolution:1,antialias:false,autoStart:false,preference:'webgl',background:'black',preserveDrawingBuffer:true});
 document.body.replaceChildren(app.canvas);
 const texture=await PIXI.Assets.load(image);
 const sprite=new PIXI.Sprite(texture);sprite.width=width;sprite.height=height;app.stage.addChild(sprite);
 const glass=createGlassEffect(PIXI,{texture,width,height,values:settings});
 sprite.filterArea=new PIXI.Rectangle(0,0,width,height);
 const u=glass.edge.resources.edgeUniforms.uniforms;
 const off=OFF[variant]||[];
 if(off.includes('blur'))u.uSoftness=0;
 if(off.includes('protect'))u.uProtectColors=0;
 if(off.includes('grain'))u.uGrain[0]=0;
 if(off.includes('line'))u.uLine[2]=0;
 sprite.filters=variant==='source'?[]:variant==='vignette'?[glass.crt]:EDGE_ONLY.includes(variant)?[glass.edge]:[glass.crt,glass.edge];
 glass.setMotion(phase,seed);
 app.render();
 const gl=app.renderer.gl;
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 const px=new Uint8Array(width*height*4);
 gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,px);
 const out=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)out.set(px.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);
 const png=app.canvas.toDataURL('image/png').split(',')[1];
 const g=app.renderer.filter&&app.renderer.filter._filterGlobalUniforms&&app.renderer.filter._filterGlobalUniforms.uniforms;
 const info={pixiVersion:PIXI.VERSION,renderer:app.renderer.name||String(app.renderer.type),textureSize:[texture.width,texture.height],
  sourcePixels:[texture.source.pixelWidth,texture.source.pixelHeight],
  filterGeometry:g?{inputSize:Array.from(g.uInputSize),inputClamp:Array.from(g.uInputClamp)}:null,
  glRenderer:gl.getParameter(gl.RENDERER)};
 // Teardown only: Pixi's touch-device accessibility hook can throw on removal.
 try{glass.destroy();app.destroy(true,{children:true})}catch(error){console.warn('reference teardown',error)}
 let bin='';for(let i=0;i<out.length;i+=0x8000)bin+=String.fromCharCode(...out.subarray(i,i+0x8000));
 return {rgba:btoa(bin),png,info};
};
window.__referenceReady=true;
</script></body></html>`

const SPECIMEN = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:black}#specimen{width:WIDTHpx;height:HEIGHTpx;overflow:hidden}#specimen img{display:block;width:WIDTHpx;height:HEIGHTpx}</style></head>
<body><div id="specimen"><img src="${SPECIMEN_URL}" alt=""></div></body></html>`

/** Serve the checkpoint's named files, the two harness pages and this run's captures. */
export async function serveProof(page: Page, proof: Proof, captures: Map<string, Buffer>, size: { width: number; height: number }) {
  const allowed = new Map<string, string>(Object.entries(REFERENCE_FILES).map(([key, rel]) => [rel, proof.files[key as keyof typeof REFERENCE_FILES].path]))
  await page.route(`**${PREFIX}**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(PREFIX.length))
    const type = (name: string) => MIME[name.split('.').at(-1) ?? ''] ?? 'application/octet-stream'
    if (path === 'harness.html') return route.fulfill({ status: 200, contentType: type(path), body: HARNESS })
    if (path === 'specimen.html') {
      return route.fulfill({ status: 200, contentType: type(path), body: SPECIMEN.replaceAll('WIDTH', String(size.width)).replaceAll('HEIGHT', String(size.height)) })
    }
    if (path.startsWith('capture/') && captures.has(path.slice(8))) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: captures.get(path.slice(8))! })
    }
    const file = path.startsWith('ref/') ? allowed.get(path.slice(4)) : undefined
    if (!file) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: type(file), body: readFileSync(file) })
  })
}

export interface ReferenceRender {
  rgba: string
  png: string
  info: { pixiVersion: string; renderer: string; textureSize: number[]; sourcePixels: number[]; filterGeometry: { inputSize: number[]; inputClamp: number[] } | null; glRenderer: string }
}

export async function renderReference(page: Page, proof: Proof, image: string, variant: ReferenceVariant, size: { width: number; height: number }): Promise<ReferenceRender> {
  await page.waitForFunction(() => (window as unknown as { __referenceReady?: boolean }).__referenceReady === true)
  return page.evaluate(
    (args) => (window as unknown as { __renderReference: (a: typeof args) => Promise<ReferenceRender> }).__renderReference(args),
    { image, settings: proof.settings, phase: proof.still.phase, seed: proof.still.seed, variant, width: size.width, height: size.height },
  )
}
