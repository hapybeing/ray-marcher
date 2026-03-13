"use client";
import { useEffect, useRef, useState } from "react";

const VS = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0, 1); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; uniform vec2 M;
out vec4 O;
#define PI 3.14159265
#define S 96
#define D 120.
#define E 0.0018

float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }

float vn(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f*f*(3.-2.*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), u.x),
             mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p){
  float v=0., a=.5;
  mat2 r = mat2(.8,.6,-.6,.8);
  for(int i=0;i<6;i++){ v+=a*vn(p); p=r*p*2.1+vec2(1.7,9.2); a*=.5; }
  return v;
}

float sdS(vec3 p, float r){ return length(p)-r; }
float sdT(vec3 p, float R, float r){ return length(vec2(length(p.xz)-R, p.y))-r; }
float sdB(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float sdO(vec3 p, float s){ p=abs(p); return (p.x+p.y+p.z-s)*.57735; }

float tH(vec2 xz){
  float h = fbm(xz*.09 + vec2(T*.012, 0.));
  h += .35*fbm(xz*.27 - vec2(0., T*.008));
  return h*h*6.5 - 1.8;
}

vec2 sc(vec3 p){
  vec2 res = vec2(p.y - tH(p.xz), 1.);

  float orb = sdS(p - vec3(0., 1.6+sin(T*.85)*.45, 0.), .95+sin(T*2.1)*.04);
  if(orb < res.x) res = vec2(orb, 2.);

  float a=T*.38, ca=cos(a), sa=sin(a);
  vec3 tp = p - vec3(sin(a)*5.2, 1.4+cos(a*.6)*.5, cos(a)*5.2);
  vec3 tr = vec3(tp.x*ca+tp.z*sa, tp.y, -tp.x*sa+tp.z*ca);
  float to = sdT(tr, 1., .22);
  if(to < res.x) res = vec2(to, 3.);

  for(int i=0;i<6;i++){
    float b = float(i)/6.*PI*2. + T*.22;
    float oc = sdO(p - vec3(sin(b)*5.5, .7+sin(T+float(i)*1.1)*.65, cos(b)*5.5), .38+sin(T*1.7+float(i)*.9)*.06);
    if(oc < res.x) res = vec2(oc, 4.);
  }

  float mn = sdB(p - vec3(3.5, tH(vec2(3.5,-3.))+2.6, -3.), vec3(.28, 2.6, .13));
  if(mn < res.x) res = vec2(mn, 5.);

  for(int i=0;i<8;i++){
    float b=float(i)/8.*PI*2.+T*.13, rt=b+T*.55;
    vec3 bp = p - vec3(sin(b)*9., .4+sin(T*.7+float(i)*.8)*.3, cos(b)*9.);
    vec3 br = vec3(bp.x*cos(rt)+bp.z*sin(rt), bp.y, -bp.x*sin(rt)+bp.z*cos(rt));
    float sh = sdB(br, vec3(.15, .5+h2(vec2(float(i),0.))*.35, .12));
    if(sh < res.x) res = vec2(sh, 6.);
  }

  for(int i=0;i<3;i++){
    float fi=float(i), a2=T*(.6+fi*.15)+fi*PI*.6;
    vec3 rp = p - vec3(0., 1.6+fi*.85+sin(T*.5+fi)*.2, 0.);
    float ct=cos(a2), st=sin(a2);
    vec3 rr = vec3(rp.x*ct+rp.y*st, -rp.x*st+rp.y*ct, rp.z);
    float rn = sdT(rr, .48+fi*.42, .04);
    if(rn < res.x) res = vec2(rn, 7.);
  }
  return res;
}

float d(vec3 p){ return sc(p).x; }

vec3 nm(vec3 p){
  const float e=.0005; const vec2 k=vec2(1,-1);
  return normalize(k.xyy*d(p+k.xyy*e)+k.yyx*d(p+k.yyx*e)+k.yxy*d(p+k.yxy*e)+k.xxx*d(p+k.xxx*e));
}

float ss(vec3 ro, vec3 rd, float a, float b, float k){
  float res=1., t=a, ph=1e10;
  for(int i=0;i<48;i++){
    float h=d(ro+rd*t);
    if(h<.001) return 0.;
    float y=h*h/(2.*ph), dv=sqrt(h*h-y*y);
    res=min(res, k*dv/max(0.,t-y)); ph=h; t+=clamp(h,.02,.4);
    if(res<.001||t>b) break;
  }
  return clamp(res,0.,1.);
}

float ao(vec3 p, vec3 n){
  float o=0., s=1.;
  for(int i=0;i<5;i++){ float h=.01+.18*float(i)/4.; o+=(h-d(p+h*n))*s; s*=.82; }
  return clamp(1.-2.2*o, 0., 1.);
}

vec3 sky(vec3 rd){
  vec3 c = mix(vec3(.01,.005,.025), vec3(0,0,.01), clamp(rd.y*.6+.4, 0., 1.));
  c += vec3(.18,.04,.3)*fbm(rd.xz*1.8+vec2(T*.025,0.))*max(0.,rd.y);
  c += vec3(0,.06,.22)*fbm(rd.xz*3.2+vec2(3.7,T*.015))*max(0.,rd.y);
  c += exp(-abs(rd.y)*6.)*vec3(.12,.04,.38)*(sin(rd.x*4.+T*.3)*.5+.5);
  float s=h2(floor(rd.xz/max(.001,abs(rd.y))*55.));
  c += step(.965,s)*(.5+.5*sin(T*3.+s*200.))*vec3(.7,.8,1.)*step(0.,rd.y);
  vec3 sun=normalize(vec3(sin(T*.15)*2.,2.,cos(T*.15)*2.));
  float sd=max(0.,dot(rd,sun));
  c += pow(sd,96.)*vec3(1.,.85,.6)*1.5 + pow(sd,12.)*vec3(.4,.2,.05)*.5;
  return c;
}

vec3 shade(vec3 pos, vec3 n, vec3 rd, int mat){
  vec3 sun=normalize(vec3(sin(T*.15)*2.,2.,cos(T*.15)*2.)), sc=vec3(1.,.85,.6);
  float df=max(0.,dot(n,sun)), sh=ss(pos+n*.003,sun,.03,22.,18.), oc=ao(pos,n);
  float fr=pow(clamp(1.-dot(n,-rd),0.,1.),4.), sp=pow(max(0.,dot(reflect(-sun,n),-rd)),64.);
  vec3 mc=vec3(1.), em=vec3(0.); float rg=.85, mt=0.;

  if(mat==1){
    vec3 rk=mix(vec3(.04,.05,.07),vec3(.08,.05,.03),fbm(pos.xz*.5));
    float c1=pow(max(0.,1.-abs(fract(fbm(pos.xz*.22+T*.018)*4.)-.5)*2.5),4.);
    float c2=pow(max(0.,1.-abs(fract(fbm(pos.xz*.41-T*.01)*3.1)-.5)*2.5),3.);
    em=(vec3(1.,.28,0.)*c1+vec3(.8,.1,0.)*c2)*1.3; mc=rk; sp*=.25; rg=.9;
  } else if(mat==2){
    mc=.5+.5*cos(6.28*(vec3(0.,.33,.67)+dot(-rd,n)*2.5+T*.4)); mt=.6; rg=.08; sp*=6.;
  } else if(mat==3){
    mc=vec3(.92,.72,.12); mt=1.; rg=.18; sp*=8.;
  } else if(mat==4){
    mc=vec3(.05,.78,.95); rg=.1; sp*=7.; em=mc*.45*(.5+.5*sin(T*2.5+pos.y*8.));
  } else if(mat==5){
    mc=vec3(.015,.01,.02); mt=.95; rg=.04; sp*=12.;
  } else if(mat==6){
    mc=vec3(.38,.08,.58); mt=.8; rg=.25; sp*=5.;
  } else {
    mc=vec3(.5,.9,1.); rg=.02; em=mc*2.*(sin(T*4.+pos.y*12.)*.4+.6);
  }

  vec3 c = vec3(.03,.015,.06)*oc + mc*sc*df*sh + mix(vec3(.04),mc,mt)*sp*sh;
  c += mc*max(0.,dot(n,-sun))*.07*vec3(.2,.1,.4) + fr*vec3(.25,.1,.5)*oc;
  c += sky(reflect(rd,n))*mix(vec3(.04),mc,mt)*fr*(1.-rg) + em;
  return c;
}

mat3 lA(vec3 ro, vec3 ta){
  vec3 f=normalize(ta-ro), r=normalize(cross(f,vec3(0,1,0)));
  return mat3(r, cross(r,f), f);
}

void main(){
  vec2 uv = (gl_FragCoord.xy*2. - R) / R.y;
  float mx=(M.x-.5)*PI*2., my=clamp(M.y,.06,.88), cr=14.;
  vec3 ro = vec3(sin(mx)*cr*cos(my*PI*.5), sin(my*PI*.5)*cr*.65+1.5, cos(mx)*cr*cos(my*PI*.5));
  vec3 rd = lA(ro, vec3(0.,.5,0.)) * normalize(vec3(uv, 1.75));
  float t=.01; int hm=-1;
  for(int i=0;i<S;i++){
    vec2 h=sc(ro+rd*t);
    if(h.x < E*(1.+t*.05)){ hm=int(h.y); break; }
    if(t > D) break;
    t += h.x;
  }
  vec3 col;
  if(hm < 0){
    col = sky(rd);
  } else {
    vec3 p=ro+rd*t;
    col = shade(p, nm(p), rd, hm);
    col = mix(col, sky(rd)*.3, 1.-exp(-t*.013));
  }
  col = (col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
  col = clamp(col, 0., 1.);
  col = pow(col, vec3(1./2.2));
  vec2 q = gl_FragCoord.xy / R;
  col *= .55 + .45*pow(16.*q.x*q.y*(1.-q.x)*(1.-q.y), .12);
  float ca=length(uv)*.004; col.r*=1.+ca; col.b*=1.-ca*.8;
  col += .012*(h2(gl_FragCoord.xy+T)-.5);
  O = vec4(col, 1.);
}`;

export default function RayMarcher() {
  const cv  = useRef(null);
  const ms  = useRef([0.5, 0.35]);
  const rf  = useRef(null);
  const [fps, setFps] = useState("--");
  const [err, setErr] = useState(null);
  const ft = useRef({ l: performance.now(), f: 0 });

  useEffect(() => {
    const canvas = cv.current;
    const gl = canvas.getContext("webgl2");
    if (!gl) { setErr("WebGL2 not supported in this browser."); return; }

    const mk = (src, tp) => {
      const s = gl.createShader(tp);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s));
      return s;
    };

    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, mk(VS, gl.VERTEX_SHADER));
      gl.attachShader(prog, mk(FS, gl.FRAGMENT_SHADER));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { setErr(e.message); return; }

    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uR = gl.getUniformLocation(prog, "R");
    const uT = gl.getUniformLocation(prog, "T");
    const uM = gl.getUniformLocation(prog, "M");

    const resize = () => {
      const pr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width  = canvas.offsetWidth  * pr;
      canvas.height = canvas.offsetHeight * pr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    const mv = e => {
      const r = canvas.getBoundingClientRect();
      ms.current = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    };
    const tc = e => {
      const t = e.touches[0], r = canvas.getBoundingClientRect();
      ms.current = [(t.clientX - r.left) / r.width, 1 - (t.clientY - r.top) / r.height];
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("touchmove", tc, { passive: true });

    const t0 = performance.now();
    const frame = now => {
      const t = (now - t0) / 1000;
      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform2f(uM, ms.current[0], ms.current[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ft.current.f++;
      if (now - ft.current.l > 600) {
        setFps(Math.round(ft.current.f * 1000 / (now - ft.current.l)));
        ft.current = { l: now, f: 0 };
      }
      rf.current = requestAnimationFrame(frame);
    };
    rf.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rf.current);
      ro.disconnect();
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("touchmove", tc);
    };
  }, []);

  const legend = [
    ["◈", "#64dcff", "Iridescent Orb"],
    ["◈", "#eab832", "Gold Torus"],
    ["◈", "#0dc8f5", "Crystal Octahedra"],
    ["◈", "#a050ff", "Energy Rings"],
    ["◈", "#9030b0", "Metal Shards"],
    ["◈", "#553366", "Obsidian Monolith"],
  ];

  return (
    <div style={{ width:"100%", height:"100vh", background:"#000", position:"relative", overflow:"hidden", fontFamily:"'Courier New',monospace" }}>
      <canvas
        ref={cv}
        style={{ width:"100%", height:"100%", display:"block", cursor:"crosshair" }}
      />

      {err && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#f66", fontSize:13, background:"#000", padding:32, textAlign:"center" }}>
          ⚠ {err}
        </div>
      )}

      {/* Top-left HUD */}
      <div style={{ position:"absolute", top:22, left:22, color:"rgba(100,220,255,.5)", fontSize:10, letterSpacing:".17em", lineHeight:2, pointerEvents:"none", textTransform:"uppercase" }}>
        <div style={{ color:"rgba(100,220,255,.9)", fontSize:12, fontWeight:"bold", marginBottom:4 }}>◈ GLSL RAY MARCHER</div>
        <div>Pure WebGL2 · No Libraries</div>
        <div>96-Step SDF · Soft Shadows</div>
        <div>fBm Terrain · AO · PBR</div>
        <div style={{ marginTop:4, color:"rgba(100,220,255,.3)" }}>{fps} fps</div>
      </div>

      {/* Top-right legend */}
      <div style={{ position:"absolute", top:22, right:22, fontSize:9, letterSpacing:".1em", lineHeight:2.3, pointerEvents:"none", textAlign:"right", textTransform:"uppercase" }}>
        {legend.map(([s, c, l]) => (
          <div key={l} style={{ color:"rgba(255,255,255,.28)" }}>
            <span style={{ color:c }}>{s}</span> {l}
          </div>
        ))}
      </div>

      {/* Bottom hint */}
      <div style={{ position:"absolute", bottom:18, left:"50%", transform:"translateX(-50%)", color:"rgba(150,80,255,.38)", fontSize:9, letterSpacing:".22em", pointerEvents:"none", textTransform:"uppercase", whiteSpace:"nowrap" }}>
        Move Mouse to Orbit · Touch Supported
      </div>
    </div>
  );
}
