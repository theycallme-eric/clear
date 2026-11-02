/*! @license
 * Shader code below derives from PixiJS 8.22.0 (filter vertex program) and
 * pixi-filters 6.1.5 (CRTFilter fragment).
 *
 * PixiJS: The MIT License. Copyright (c) 2013-2023 Mathew Groves, Chad Engler
 * pixi-filters: The MIT License. Copyright (c) 2013-2025 Mathew Groves, Chad Engler
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
/**
 * Effects TASK-005 — the only shader code the CRT Glass field ships.
 *
 * Imported by `renderer.ts` alone, so it lives in the lazily loaded renderer
 * chunk and never in the app entry. Each program is carried over from the
 * preserved reference so the WebGL2 pipeline produces the same pixels as the
 * preserved motion host (PixiJS 8.22.0 + pixi-filters 6.1.5). Only the parts
 * the pipeline uses are kept; neither prototype bundle is shipped.
 *
 * Pass order (from `crt-glass-motion/glass-effect.mjs`, not the export's older
 * `pipeline` label):
 *
 *   0. The source texture, already Echo-composed, is drawn into the first
 *      filter input, as Pixi draws the sprite.
 *   1. CRTFilter with its own lines and grain off (lineWidth 0, lineContrast 0,
 *      noise 0): it supplies only the vignette.
 *   2. The custom final pass: perimeter edge softness, then optional colour
 *      protection from the original texture, then exactly one curved line field
 *      and independent grain, applied to RGB together with a dark-ground light
 *      floor.
 */

/**
 * PixiJS 8.22.0 filter vertex program (`filterVertexPosition` /
 * `filterTextureCoord`), with the vertex precision Pixi prepends. MIT notice
 * at the top of this file.
 */
export const FILTER_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`

/** Pass 0: the source texture into the first filter input, unchanged. */
export const SOURCE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main(void)
{
    finalColor = texture(uTexture, vTextureCoord);
}
`

/**
 * Pass 1: pixi-filters 6.1.5 CRTFilter fragment, verbatim. The pipeline sets
 * uLine[1], uLine[2] and uNoise[0] to 0, so only `vignette()` contributes.
 * MIT notice at the top of this file.
 */
export const CRT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uLine;
uniform vec2 uNoise;
uniform vec3 uVignette;
uniform float uSeed;
uniform float uTime;
uniform vec2 uDimensions;

uniform vec4 uInputSize;

const float SQRT_2 = 1.414213;

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float vignette(vec3 co, vec2 coord)
{
    float outter = SQRT_2 - uVignette[0] * SQRT_2;
    vec2 dir = vec2(0.5) - coord;
    dir.y *= uDimensions.y / uDimensions.x;
    float darker = clamp((outter - length(dir) * SQRT_2) / ( 0.00001 + uVignette[2] * SQRT_2), 0.0, 1.0);
    return darker + (1.0 - darker) * (1.0 - uVignette[1]);
}

float noise(vec2 coord)
{
    vec2 pixelCoord = coord * uInputSize.xy;
    pixelCoord.x = floor(pixelCoord.x / uNoise[1]);
    pixelCoord.y = floor(pixelCoord.y / uNoise[1]);
    return (rand(pixelCoord * uNoise[1] * uSeed) - 0.5) * uNoise[0];
}

vec3 interlaceLines(vec3 co, vec2 coord)
{
    vec3 color = co;

    float curvature = uLine[0];
    float lineWidth = uLine[1];
    float lineContrast = uLine[2];
    float verticalLine = uLine[3];

    vec2 dir = vec2(coord * uInputSize.xy / uDimensions - 0.5);

    float _c = curvature > 0. ? curvature : 1.;
    float k = curvature > 0. ? (length(dir * dir) * 0.25 * _c * _c + 0.935 * _c) : 1.;
    vec2 uv = dir * k;
    float v = verticalLine > 0.5 ? uv.x * uDimensions.x : uv.y * uDimensions.y;
    v *= min(1.0, 2.0 / lineWidth ) / _c;
    float j = 1. + cos(v * 1.2 - uTime) * 0.5 * lineContrast;
    color *= j;

    float segment = verticalLine > 0.5 ? mod((dir.x + .5) * uDimensions.x, 4.) : mod((dir.y + .5) * uDimensions.y, 4.);
    color *= 0.99 + ceil(segment) * 0.015;

    return color;
}

void main(void)
{
    finalColor = texture(uTexture, vTextureCoord);
    vec2 coord = vTextureCoord * uInputSize.xy / uDimensions;

    if (uNoise[0] > 0.0 && uNoise[1] > 0.0)
    {
        float n = noise(vTextureCoord);
        finalColor += vec4(n, n, n, finalColor.a);
    }

    if (uVignette[0] > 0.)
    {
        float v = vignette(finalColor.rgb, coord);
        finalColor *= vec4(v, v, v, finalColor.a);
    }

    if (uLine[1] > 0.0)
    {
        finalColor = vec4(interlaceLines(finalColor.rgb, vTextureCoord), finalColor.a);
    }
}
`

/**
 * Pass 2: the shared custom pass from `crt-glass-motion/glass-effect.mjs`,
 * verbatim. Edge softness and colour protection come first; the line field
 * and grain are added last, once, so neither earlier operation can erase
 * their motion. Grain feathering (`uGrainSoftness`) is read only inside
 * `grainAt`, which runs only when grain is on.
 */
export const GLASS_FRAGMENT = `#version 300 es
precision highp float;in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform sampler2D uOriginal;uniform vec4 uInputSize;uniform vec4 uInputClamp;uniform float uSoftness;uniform float uReach;uniform float uProtectColors;uniform vec2 uSize;uniform vec4 uLine;uniform float uPhase;uniform vec3 uGrain;uniform float uGrainSoftness;
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
}`

/** The passes, in the order the renderer runs them. */
export const PASS_ORDER = ['source', 'crt-vignette', 'edge-protect-line-grain'] as const
