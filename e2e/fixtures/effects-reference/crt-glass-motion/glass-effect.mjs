export const PRESETS=Object.freeze({
 selected:{curvature:.15,lineWidth:3,lineContrast:.06,edgeBlur:.90,edgeWidth:.06,vignetting:.01,vignettingAlpha:.02,vignettingBlur:.32,noise:.01,noiseSize:1,grainSoftness:.01},
 demo:{curvature:1.1,lineWidth:3,lineContrast:.30,edgeBlur:1.6,edgeWidth:.28,vignetting:.30,vignettingAlpha:1,vignettingBlur:.30,noise:.20,noiseSize:1,grainSoftness:.01}
});

const vertex=`in vec2 aPosition;out vec2 vTextureCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment=`precision highp float;in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform sampler2D uOriginal;uniform vec4 uInputSize;uniform vec4 uInputClamp;uniform float uSoftness;uniform float uReach;uniform float uProtectColors;uniform vec2 uSize;uniform vec4 uLine;uniform float uPhase;uniform vec3 uGrain;uniform float uGrainSoftness;
vec4 sampleAt(vec2 p){return texture(uTexture,clamp(p,uInputClamp.xy,uInputClamp.zw));}
float grainRandom(vec2 cell){return fract(sin(dot(cell*uGrain.z,vec2(12.9898,78.233)))*43758.5453);}
float grainAt(vec2 pixel){
 vec2 grid=pixel/max(uGrain.y,.25);
 vec2 cell=floor(grid);
 float sharp=grainRandom(cell);
 if(uGrainSoftness<=.001)return sharp;
 vec2 blend=fract(grid);
 blend=blend*blend*(3.0-2.0*blend);
 float smoothGrain=mix(mix(sharp,grainRandom(cell+vec2(1.0,0.0)),blend.x),mix(grainRandom(cell+vec2(0.0,1.0)),grainRandom(cell+vec2(1.0,1.0)),blend.x),blend.y);
 return mix(sharp,smoothGrain,uGrainSoftness);
}
void main(){
 vec2 uv=vTextureCoord;
 vec2 centre=(uInputClamp.xy+uInputClamp.zw)*.5;
 vec2 radius=(uInputClamp.zw-uInputClamp.xy)*.5;
 float edge=max(abs((uv-centre).x/radius.x),abs((uv-centre).y/radius.y));
 float amount=smoothstep(1.0-uReach,1.0,edge);
 vec4 c=sampleAt(uv);
 if(amount>.001&&uSoftness>.001){
  vec2 d=uInputSize.zw*uSoftness*amount;
  c*=.28;
  c+=(sampleAt(uv+vec2(d.x,0.0))+sampleAt(uv-vec2(d.x,0.0))+sampleAt(uv+vec2(0.0,d.y))+sampleAt(uv-vec2(0.0,d.y)))*.12;
  c+=(sampleAt(uv+d*.7071)+sampleAt(uv-d*.7071)+sampleAt(uv+vec2(d.x,-d.y)*.7071)+sampleAt(uv+vec2(-d.x,d.y)*.7071))*.06;
 }
 if(uProtectColors>.5){
  vec3 original=texture(uOriginal,clamp(uv*uInputSize.xy/uSize,0.0,1.0)).rgb;
  float peak=max(original.r,max(original.g,original.b));
  float brightness=dot(original,vec3(.2126,.7152,.0722));
  float filtered=dot(c.rgb,vec3(.2126,.7152,.0722));
  float ratio=clamp(filtered/max(brightness,.001),.94,1.04);
  ratio=min(ratio,1.0/max(peak,.001));
  float protection=smoothstep(.30,.65,peak);
  c.rgb=mix(c.rgb,original*ratio,protection);
 }
 // Final light texture stays after blur/color restoration so neither the
 // moving lines nor refreshed grain is erased by those earlier operations.
 float lightDelta=0.0;
 vec2 coord=uv*uInputSize.xy/uSize;
 if(uGrain.x>0.0){
  float random=grainAt(coord*uSize);
  lightDelta+=(random-.5)*uGrain.x;
 }
 // One moving line signal. Use the CRT's
 // curved phase field with a light floor so the dark ground also reads.
 // Scale RGB channels together: no grey veil or change to their ratios.
 if(uLine.y>0.0&&uLine.z>0.0){
  vec2 dir=coord-.5;
  float curvature=uLine.x>0.0?uLine.x:1.0;
  float k=uLine.x>0.0?(length(dir*dir)*.25*curvature*curvature+.935*curvature):1.0;
  vec2 bent=dir*k;
  float v=uLine.w>.5?bent.x*uSize.x:bent.y*uSize.y;
  v*=min(1.0,2.0/uLine.y)/curvature;
  float wave=cos(v*1.2-uPhase);
  float peak=max(c.r,max(c.g,c.b));
  float lightFloor=.65;
  lightDelta+=wave*.5*uLine.z*max(peak,lightFloor);
 }
 float peak=max(c.r,max(c.g,c.b));
 float target=clamp(peak+lightDelta,0.0,1.0);
 c.rgb*=target/max(peak,.0001);
 finalColor=c;
}`;

// Shared rendering owner. It accepts the source texture; it does not own UI,
// input, animation scheduling, texture capture, or the caller's texture lifetime.
export function createGlassEffect(PIXI, {texture,width,height,values=PRESETS.selected}) {
 // CRT handles vignette. Lines and grain have one owner in the final pass.
 const crt=new PIXI.filters.CRTFilter({...values,lineWidth:0,lineContrast:0,noise:0,seed:.57,time:.5});
 const edge=new PIXI.Filter({
  glProgram:PIXI.GlProgram.from({vertex,fragment,name:'clear-glass-edge-softness'}),
  resources:{uOriginal:texture.source,edgeUniforms:{
   uSoftness:{value:values.edgeBlur,type:'f32'},
   uReach:{value:values.edgeWidth,type:'f32'},
   uProtectColors:{value:values.colorProtect===false?0:1,type:'f32'},
   uSize:{value:new Float32Array([width,height]),type:'vec2<f32>'},
   uLine:{value:new Float32Array([values.curvature??0,values.lineWidth??3,values.lineContrast??.06,values.verticalLine?1:0]),type:'vec4<f32>'},
   uPhase:{value:.5,type:'f32'},
   uGrain:{value:new Float32Array([values.noise??0,values.noiseSize??1,.57]),type:'vec3<f32>'},
   uGrainSoftness:{value:values.grainSoftness??0,type:'f32'}
  }}
 });
 crt.padding=0;edge.padding=0;
 const filters=[crt,edge];
 function update(next,source=texture){
  for(const key of ['vignetting','vignettingAlpha','vignettingBlur']){
   if(next[key]!==undefined)crt[key]=next[key];
  }
  edge.resources.edgeUniforms.uniforms.uSoftness=next.edgeBlur;
  edge.resources.edgeUniforms.uniforms.uReach=next.edgeWidth;
  edge.resources.edgeUniforms.uniforms.uProtectColors=next.colorProtect===false?0:1;
  edge.resources.edgeUniforms.uniforms.uLine.set([next.curvature,next.lineWidth,next.lineContrast,next.verticalLine?1:0]);
  edge.resources.edgeUniforms.uniforms.uGrain[0]=next.noise;
  edge.resources.edgeUniforms.uniforms.uGrain[1]=next.noiseSize;
  edge.resources.edgeUniforms.uniforms.uGrainSoftness=Math.max(0,Math.min(1,next.grainSoftness??0));
  edge.resources.uOriginal=source.source;
 }
 function setMotion(phase,seed){
  crt.time=phase;crt.seed=seed;
  edge.resources.edgeUniforms.uniforms.uPhase=phase;
  edge.resources.edgeUniforms.uniforms.uGrain[2]=seed;
 }
 function destroy(){crt.destroy();edge.destroy()}
 update(values,texture);
 return {crt,edge,filters,update,setMotion,destroy};
}
