"use client";
import { useEffect, useRef, useState } from "react";

const VS = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2  R;
uniform float T;
uniform vec2  M;
out vec4 O;

#define PI        3.14159265359
#define MAX_STEPS 120
#define MAX_DIST  100.0
#define SURF      0.002

/* ── Hash / Noise ─────────────────────────────────── */
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

float vn(vec2 p){
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  return mix(mix(h2(i),        h2(i+vec2(1,0)), u.x),
             mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),u.x), u.y);
}

float fbm(vec2 p){
  float v=0., a=.5;
  mat2 rot=mat2(.8,.6,-.6,.8);
  for(int i=0;i<5;i++){ v+=a*vn(p); p=rot*p*2.1+vec2(1.7,9.2); a*=.5; }
  return v;
}

/* ── SDFs ─────────────────────────────────────────── */
float sdSphere(vec3 p, float r){ return length(p)-r; }
float sdTorus(vec3 p, float R2, float r){ return length(vec2(length(p.xz)-R2,p.y))-r; }
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float sdOcta(vec3 p, float s){ p=abs(p); return (p.x+p.y+p.z-s)*.57735027; }

/* ── Terrain: capped to max height 3.5 ───────────── */
float tH(vec2 xz){
  float h = fbm(xz*0.08 + vec2(T*0.01, 0.0));
  h += 0.3*fbm(xz*0.22 - vec2(0.0, T*0.007));
  return clamp(h*h*4.0 - 0.5, -1.5, 3.5);   // CAPPED: never above 3.5
}

/* ── Scene SDF ────────────────────────────────────── */
vec2 scene(vec3 p){
  /* terrain – use a conservative step multiplier to avoid overshoot */
  float terr = (p.y - tH(p.xz)) * 0.6;
  vec2 res = vec2(terr, 1.0);

  /* central iridescent orb */
  vec3 op = p - vec3(0.0, 2.2+sin(T*0.85)*0.4, 0.0);
  float orb = sdSphere(op, 1.0+sin(T*2.1)*0.04);
  if(orb < res.x) res = vec2(orb, 2.0);

  /* orbiting gold torus */
  float a1=T*0.38, ca=cos(a1), sa=sin(a1);
  vec3 tp = p - vec3(sin(a1)*5.5, 2.2+cos(a1*0.6)*0.5, cos(a1)*5.5);
  vec3 tr = vec3(tp.x*ca+tp.z*sa, tp.y, -tp.x*sa+tp.z*ca);
  float tor = sdTorus(tr, 1.0, 0.22);
  if(tor < res.x) res = vec2(tor, 3.0);

  /* 6 cyan crystal octahedra */
  for(int i=0;i<6;i++){
    float b = float(i)/6.0*PI*2.0 + T*0.22;
    vec3 ep = p - vec3(sin(b)*5.8, 1.2+sin(T+float(i)*1.1)*0.6, cos(b)*5.8);
    float oc = sdOcta(ep, 0.38+sin(T*1.7+float(i)*0.9)*0.06);
    if(oc < res.x) res = vec2(oc, 4.0);
  }

  /* obsidian monolith */
  float mby = tH(vec2(3.8, -3.2));
  vec3 mp = p - vec3(3.8, mby+2.8, -3.2);
  float mn = sdBox(mp, vec3(0.28, 2.8, 0.13));
  if(mn < res.x) res = vec2(mn, 5.0);

  /* 8 rotating metal shards */
  for(int i=0;i<8;i++){
    float b=float(i)/8.0*PI*2.0+T*0.13, rt=b+T*0.55;
    vec3 bp = p - vec3(sin(b)*9.0, 0.6+sin(T*0.7+float(i)*0.8)*0.3, cos(b)*9.0);
    vec3 br = vec3(bp.x*cos(rt)+bp.z*sin(rt), bp.y, -bp.x*sin(rt)+bp.z*cos(rt));
    float sh = sdBox(br, vec3(0.14, 0.55+h2(vec2(float(i),0.0))*0.3, 0.11));
    if(sh < res.x) res = vec2(sh, 6.0);
  }

  /* 3 stacked energy rings */
  for(int i=0;i<3;i++){
    float fi=float(i), a2=T*(0.6+fi*0.15)+fi*PI*0.6;
    vec3 rp = p - vec3(0.0, 2.2+fi*0.9+sin(T*0.5+fi)*0.2, 0.0);
    float ct=cos(a2), st=sin(a2);
    vec3 rr = vec3(rp.x*ct+rp.y*st, -rp.x*st+rp.y*ct, rp.z);
    float rn = sdTorus(rr, 0.5+fi*0.45, 0.042);
    if(rn < res.x) res = vec2(rn, 7.0);
  }

  return res;
}

float D(vec3 p){ return scene(p).x; }

/* ── Normal (tetrahedron) ─────────────────────────── */
vec3 calcNormal(vec3 p){
  const float e=0.0004;
  const vec2  k=vec2(1.,-1.);
  return normalize(k.xyy*D(p+k.xyy*e)+k.yyx*D(p+k.yyx*e)+
                   k.yxy*D(p+k.yxy*e)+k.xxx*D(p+k.xxx*e));
}

/* ── Soft shadow ──────────────────────────────────── */
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k){
  float res=1.0, t=tmin, ph=1e10;
  for(int i=0;i<56;i++){
    float h=D(ro+rd*t);
    if(h<0.001) return 0.0;
    float y=h*h/(2.0*ph), dv=sqrt(h*h-y*y);
    res=min(res, k*dv/max(0.0,t-y));
    ph=h; t+=clamp(h,0.015,0.5);
    if(res<0.001||t>tmax) break;
  }
  return clamp(res,0.0,1.0);
}

/* ── Ambient occlusion ────────────────────────────── */
float calcAO(vec3 pos, vec3 nor){
  float occ=0.0, sca=1.0;
  for(int i=0;i<5;i++){
    float h=0.01+0.2*float(i)/4.0;
    occ+=(h-D(pos+h*nor))*sca; sca*=0.8;
  }
  return clamp(1.0-2.0*occ, 0.0, 1.0);
}

/* ── Sky / atmosphere ─────────────────────────────── */
vec3 sky(vec3 rd){
  /* deep space base */
  vec3 c = mix(vec3(0.02,0.01,0.06), vec3(0.0,0.0,0.02),
               clamp(rd.y*0.7+0.3, 0.0, 1.0));

  /* nebula layers – visible on both sides of horizon */
  float yp = max(0.0, rd.y);
  c += vec3(0.22,0.04,0.35) * fbm(rd.xz*1.6+vec2(T*0.022,0.0)) * yp;
  c += vec3(0.0, 0.08,0.28) * fbm(rd.xz*3.0+vec2(3.7,T*0.013)) * yp;

  /* aurora band near horizon */
  float horiz = exp(-abs(rd.y)*5.0);
  c += horiz * vec3(0.15,0.05,0.45)*(sin(rd.x*3.5+T*0.28)*0.5+0.5);
  c += horiz * vec3(0.0, 0.15,0.25)*(cos(rd.x*5.2-T*0.18)*0.5+0.5);

  /* stars */
  float s = h2(floor(rd.xz/max(0.001,abs(rd.y)+0.001)*52.0));
  c += step(0.962, s)*(0.5+0.5*sin(T*2.5+s*180.0))*vec3(0.75,0.85,1.0)*step(0.0,rd.y);

  /* sun glow */
  vec3 sun = normalize(vec3(sin(T*0.13)*2.0, 2.2, cos(T*0.13)*2.0));
  float sd = max(0.0, dot(rd, sun));
  c += pow(sd,90.0)*vec3(1.0,0.88,0.65)*1.8;
  c += pow(sd,10.0)*vec3(0.45,0.22,0.05)*0.6;

  return c;
}

/* ── Material / shading ───────────────────────────── */
vec3 shade(vec3 pos, vec3 nor, vec3 rd, float mat){
  vec3 sun    = normalize(vec3(sin(T*0.13)*2.0, 2.2, cos(T*0.13)*2.0));
  vec3 sunCol = vec3(1.0, 0.88, 0.65);

  float diff = max(0.0, dot(nor, sun));
  float shad = softShadow(pos+nor*0.004, sun, 0.04, 20.0, 16.0);
  float occ  = calcAO(pos, nor);
  float fres = pow(clamp(1.0-dot(nor,-rd),0.0,1.0), 4.0);
  float spec = pow(max(0.0, dot(reflect(-sun,nor),-rd)), 64.0);

  vec3  mc=vec3(1.0), em=vec3(0.0);
  float rg=0.85, mt=0.0;

  int m = int(mat);

  if(m==1){
    /* basalt terrain with lava cracks */
    vec3 rock = mix(vec3(0.05,0.06,0.08), vec3(0.09,0.05,0.03), fbm(pos.xz*0.4));
    float c1=pow(max(0.0,1.0-abs(fract(fbm(pos.xz*0.2+T*0.016)*4.0)-0.5)*2.2),4.0);
    float c2=pow(max(0.0,1.0-abs(fract(fbm(pos.xz*0.38-T*0.009)*3.2)-0.5)*2.2),3.0);
    em   = (vec3(1.0,0.28,0.0)*c1 + vec3(0.85,0.08,0.0)*c2)*1.4;
    mc   = rock; spec*=0.2; rg=0.92;
  } else if(m==2){
    /* rainbow iridescent orb */
    mc  = 0.5+0.5*cos(6.2832*(vec3(0.0,0.33,0.67)+dot(-rd,nor)*2.8+T*0.45));
    mt=0.65; rg=0.06; spec*=7.0;
  } else if(m==3){
    /* brushed gold */
    mc=vec3(0.94,0.74,0.13); mt=1.0; rg=0.16; spec*=9.0;
  } else if(m==4){
    /* cyan crystal */
    mc=vec3(0.04,0.82,0.98); rg=0.08; spec*=8.0;
    em=mc*0.5*(0.5+0.5*sin(T*2.8+pos.y*9.0));
  } else if(m==5){
    /* obsidian monolith */
    mc=vec3(0.012,0.008,0.018); mt=0.96; rg=0.03; spec*=14.0;
  } else if(m==6){
    /* violet metal shards */
    mc=vec3(0.40,0.07,0.60); mt=0.82; rg=0.22; spec*=6.0;
  } else {
    /* plasma energy rings */
    mc=vec3(0.5,0.92,1.0); rg=0.02;
    em=mc*2.2*(0.5+0.5*sin(T*4.5+pos.y*14.0));
  }

  vec3 col  = vec3(0.04,0.02,0.08)*occ;                   // ambient
  col += mc*sunCol*diff*shad;                              // diffuse
  col += mix(vec3(0.04),mc,mt)*spec*shad;                  // specular
  col += mc*max(0.0,dot(nor,-sun))*0.08*vec3(0.2,0.1,0.4);// fill
  col += fres*vec3(0.3,0.12,0.6)*occ;                     // rim
  col += sky(reflect(rd,nor))*mix(vec3(0.04),mc,mt)*fres*(1.0-rg); // env refl
  col += em;

  return col;
}

/* ── Camera ───────────────────────────────────────── */
mat3 lookAt(vec3 ro, vec3 ta){
  vec3 f=normalize(ta-ro), r=normalize(cross(f,vec3(0,1,0)));
  return mat3(r, cross(r,f), f);
}

/* ── Main ─────────────────────────────────────────── */
void main(){
  vec2 uv = (gl_FragCoord.xy*2.0 - R) / R.y;

  /* camera: mouse orbits, sits well above terrain max (3.5) */
  float mx  = (M.x - 0.5)*PI*2.0;
  float my  = clamp(M.y, 0.08, 0.85);
  float cr  = 16.0;
  float camY = sin(my*PI*0.5)*cr*0.6 + 5.5;   // min ~5.5 units high
  vec3 ro = vec3(sin(mx)*cr*cos(my*PI*0.5), camY, cos(mx)*cr*cos(my*PI*0.5));
  vec3 ta = vec3(0.0, 1.2, 0.0);
  mat3 cam = lookAt(ro, ta);
  vec3 rd  = cam * normalize(vec3(uv, 1.8));

  /* ray march */
  float t=0.05; int hitMat=-1;
  for(int i=0;i<MAX_STEPS;i++){
    vec2 h = scene(ro+rd*t);
    if(h.x < SURF*(1.0+t*0.04)){ hitMat=int(h.y); break; }
    if(t > MAX_DIST) break;
    t += h.x;
  }

  /* colour */
  vec3 col;
  if(hitMat < 0){
    col = sky(rd);                                          // sky
  } else {
    vec3 pos = ro + rd*t;
    vec3 nor = calcNormal(pos);
    col = shade(pos, nor, rd, float(hitMat));
    /* atmospheric fog – sky colour, not darkened */
    float fog = 1.0 - exp(-t*0.010);
    col = mix(col, sky(rd), fog*0.55);
  }

  /* ACES filmic tone-map */
  col = (col*(2.51*col+0.03)) / (col*(2.43*col+0.59)+0.14);
  col = clamp(col, 0.0, 1.0);

  /* gamma */
  col = pow(col, vec3(1.0/2.2));

  /* vignette */
  vec2 q = gl_FragCoord.xy/R;
  col *= 0.5 + 0.5*pow(16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.14);

  /* subtle chromatic aberration */
  float ca = length(uv)*0.003;
  col.r *= 1.0+ca; col.b *= 1.0-ca*0.7;

  /* film grain */
  col += 0.010*(h2(gl_FragCoord.xy+T) - 0.5);

  O = vec4(col, 1.0);
}`;

/* ─────────────────────────────────────────────────────
   React component
───────────────────────────────────────────────────── */
export default function RayMarcher() {
  const cv  = useRef(null);
  const ms  = useRef([0.5, 0.38]);
  const rf  = useRef(null);
  const [fps,  setFps]  = useState("--");
  const [err,  setErr]  = useState(null);
  const [ready,setReady]= useState(false);
  const ft = useRef({ l: 0, f: 0 });

  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;

    /* ── wait for canvas to have real dimensions ── */
    const tryInit = () => {
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        requestAnimationFrame(tryInit);
        return;
      }
      init();
    };
    requestAnimationFrame(tryInit);

    function init() {
      const gl = canvas.getContext("webgl2");
      if (!gl) { setErr("WebGL2 not supported in this browser."); return; }

      /* compile shaders */
      const mkShader = (src, type) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(s));
        return s;
      };

      let prog;
      try {
        prog = gl.createProgram();
        gl.attachShader(prog, mkShader(VS, gl.VERTEX_SHADER));
        gl.attachShader(prog, mkShader(FS, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(prog));
      } catch (e) { setErr(e.message); return; }

      /* fullscreen quad */
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const uR = gl.getUniformLocation(prog, "R");
      const uT = gl.getUniformLocation(prog, "T");
      const uM = gl.getUniformLocation(prog, "M");

      /* resize – use devicePixelRatio capped at 1.5 */
      const resize = () => {
        const pr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width  = canvas.offsetWidth  * pr;
        canvas.height = canvas.offsetHeight * pr;
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(canvas);

      /* mouse / touch */
      const onMove = e => {
        const r = canvas.getBoundingClientRect();
        ms.current = [(e.clientX-r.left)/r.width, 1-(e.clientY-r.top)/r.height];
      };
      const onTouch = e => {
        const t = e.touches[0], r = canvas.getBoundingClientRect();
        ms.current = [(t.clientX-r.left)/r.width, 1-(t.clientY-r.top)/r.height];
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("touchmove", onTouch, { passive: true });

      setReady(true);
      ft.current = { l: performance.now(), f: 0 };
      const t0 = performance.now();

      const frame = (now) => {
        const t = (now - t0) / 1000;
        gl.useProgram(prog); gl.bindVertexArray(vao);
        gl.uniform2f(uR, canvas.width, canvas.height);
        gl.uniform1f(uT, t);
        gl.uniform2f(uM, ms.current[0], ms.current[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        ft.current.f++;
        if (now - ft.current.l > 700) {
          setFps(Math.round(ft.current.f * 1000 / (now - ft.current.l)));
          ft.current = { l: now, f: 0 };
        }
        rf.current = requestAnimationFrame(frame);
      };
      rf.current = requestAnimationFrame(frame);

      /* cleanup */
      canvas._cleanup = () => {
        cancelAnimationFrame(rf.current);
        ro.disconnect();
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("touchmove", onTouch);
      };
    }

    return () => { canvas._cleanup?.(); };
  }, []);

  const legend = [
    ["◈","#64dcff","Iridescent Orb"],
    ["◈","#eab832","Gold Torus"],
    ["◈","#0dc8f5","Crystal Octahedra"],
    ["◈","#a050ff","Energy Rings"],
    ["◈","#9030b0","Metal Shards"],
    ["◈","#553366","Obsidian Monolith"],
  ];

  return (
    <div style={{
      width:"100vw", height:"100vh",
      background:"#000",
      position:"relative", overflow:"hidden",
      fontFamily:"'Courier New', monospace"
    }}>
      <canvas
        ref={cv}
        style={{ width:"100%", height:"100%", display:"block", cursor:"crosshair" }}
      />

      {/* Error overlay */}
      {err && (
        <div style={{
          position:"absolute", inset:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"#ff6060", fontSize:14, background:"#000",
          padding:32, textAlign:"center", lineHeight:1.8
        }}>⚠ {err}</div>
      )}

      {/* Top-left HUD */}
      <div style={{
        position:"absolute", top:22, left:22,
        color:"rgba(100,220,255,.5)", fontSize:10,
        letterSpacing:".17em", lineHeight:2.1,
        pointerEvents:"none", textTransform:"uppercase"
      }}>
        <div style={{color:"rgba(100,220,255,.95)",fontSize:12,fontWeight:"bold",marginBottom:4}}>
          ◈ GLSL RAY MARCHER
        </div>
        <div>Pure WebGL2 · No Libraries</div>
        <div>120-Step SDF · Soft Shadows</div>
        <div>fBm Terrain · AO · PBR-lite</div>
        <div style={{marginTop:4,color:"rgba(100,220,255,.3)"}}>{fps} fps</div>
      </div>

      {/* Top-right legend */}
      <div style={{
        position:"absolute", top:22, right:22,
        fontSize:9, letterSpacing:".1em", lineHeight:2.5,
        pointerEvents:"none", textAlign:"right", textTransform:"uppercase"
      }}>
        {legend.map(([s,c,l]) => (
          <div key={l} style={{color:"rgba(255,255,255,.28)"}}>
            <span style={{color:c}}>{s}</span> {l}
          </div>
        ))}
      </div>

      {/* Bottom hint */}
      <div style={{
        position:"absolute", bottom:18, left:"50%",
        transform:"translateX(-50%)",
        color:"rgba(150,80,255,.38)", fontSize:9,
        letterSpacing:".22em", pointerEvents:"none",
        textTransform:"uppercase", whiteSpace:"nowrap"
      }}>
        Move Mouse · Drag to Orbit · Touch Supported
      </div>
    </div>
  );
}
