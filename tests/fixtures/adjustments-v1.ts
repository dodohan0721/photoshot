// Independent RGB/8-bit adjustment engine. Design references: docs/adjustment-layers.md.
export type Channel = 'rgb' | 'r' | 'g' | 'b';
export type CurvePoint = { x: number; y: number };
export type Cube = { size: number; name: string; min: number[]; max: number[]; data: number[] };
export type AdjustmentType = 'brightness' | 'levels' | 'curves' | 'exposure' | 'vibrance' | 'hsl' | 'balance' | 'blackwhite' | 'photo' | 'mixer' | 'lookup' | 'invert' | 'posterize' | 'threshold' | 'gradient' | 'selective';
export type Adjustment = {
  type: AdjustmentType; scope: 'below' | 'clipped'; values: Record<string, number>;
  curves?: Record<Channel, CurvePoint[]>;
  colors?: string[];
  cube?: Cube;
};
export type Control = { key: string; label: string; min: number; max: number; initial: number; step?: number; group?: string };
const control = (key: string, label: string, min: number, max: number, initial = 0, step = 1, group?: string): Control => ({ key, label, min, max, initial, step, group });
export const channels: Channel[] = ['rgb','r','g','b'];
export const colorNames = ['빨강','노랑','초록','청록','파랑','자홍','흰색','중간색','검정'];
export const definitions: Record<AdjustmentType, { name: string; description: string; controls: Control[] }> = {
  brightness: { name:'밝기 / 대비', description:'중간 밝기와 명암 차이를 조절합니다.', controls:[control('brightness','밝기',-100,100),control('contrast','대비',-100,100)] },
  levels: { name:'레벨', description:'입력·출력 범위와 중간톤을 채널별로 조절합니다.', controls:channels.flatMap(c=>[control(c+'Black','입력 검정',0,254,0,1,c),control(c+'Gamma','중간톤',.1,10,1,.01,c),control(c+'White','입력 흰색',1,255,255,1,c),control(c+'OutBlack','출력 검정',0,255,0,1,c),control(c+'OutWhite','출력 흰색',0,255,255,1,c)]) },
  curves: { name:'곡선', description:'선을 클릭해 점을 추가하고 드래그해 명암을 조절합니다.', controls:[] },
  exposure: { name:'노출', description:'노출(EV), 오프셋과 감마를 조절합니다.', controls:[control('ev','노출 (EV)',-20,20,0,.01),control('offset','오프셋',-.5,.5,0,.0001),control('gamma','감마',.01,9.99,1,.01)] },
  vibrance: { name:'활기', description:'채도가 낮은 색을 중심으로 생동감을 조절합니다.', controls:[control('vibrance','활기',-100,100),control('saturation','채도',-100,100)] },
  hsl: { name:'색조 / 채도', description:'색상환의 색조, 채도와 명도를 조절합니다.', controls:[control('hue','색조',-180,180),control('saturation','채도',-100,100),control('lightness','명도',-100,100)] },
  balance: { name:'색상 균형', description:'어두운 영역·중간톤·밝은 영역의 색 균형을 조절합니다.', controls:['shadows','midtones','highlights'].flatMap(g=>[control(g+'R','청록 ↔ 빨강',-100,100,0,1,g),control(g+'G','자홍 ↔ 초록',-100,100,0,1,g),control(g+'B','노랑 ↔ 파랑',-100,100,0,1,g)]).concat(control('preserve','명도 유지',0,1,1)) },
  blackwhite: { name:'흑백', description:'원본의 색상별 밝기를 조절하며 흑백으로 변환합니다.', controls:colorNames.slice(0,6).map((n,i)=>control('color'+i,n,-100,300,[40,60,40,60,20,80][i])) },
  photo: { name:'포토 필터', description:'원하는 필터 색과 농도로 색감을 더합니다.', controls:[control('density','농도',0,100,25),control('preserve','명도 유지',0,1,1)] },
  mixer: { name:'채널 혼합', description:'출력 채널을 원본 RGB 채널의 비율로 만듭니다.', controls:['r','g','b'].flatMap(c=>['R','G','B','Constant'].map((v,i)=>control(c+v,['빨강','초록','파랑','상수'][i],-200,200,c===v.toLowerCase()?100:0,1,c))).concat(control('mono','단색',0,1)) },
  lookup: { name:'컬러 룩업 (LUT)', description:'.cube 형식의 3D LUT를 불러와 색감을 적용합니다.', controls:[] },
  invert: { name:'반전', description:'RGB 색상을 반전합니다.', controls:[] },
  posterize: { name:'포스터화', description:'각 채널의 명암 단계 수를 줄입니다.', controls:[control('steps','단계',2,256,6)] },
  threshold: { name:'한계값', description:'기준 밝기에 따라 검정과 흰색으로 나눕니다.', controls:[control('threshold','한계값',0,255,128)] },
  gradient: { name:'그레이디언트 맵', description:'어두운 부분부터 밝은 부분까지 두 색으로 매핑합니다.', controls:[control('reverse','반전',0,1)] },
  selective: { name:'선택 색상', description:'색상 계열별로 청록·자홍·노랑·검정 성분을 조절합니다.', controls:colorNames.flatMap((_,i)=>['C','M','Y','K'].map((c,j)=>control(i+c,['청록','자홍','노랑','검정'][j],-100,100,0,1,String(i)))).concat(control('relative','상대값',0,1,1)) },
};
export const adjustmentTypes = Object.keys(definitions) as AdjustmentType[];
export function makeAdjustment(type: AdjustmentType): Adjustment {
  const a: Adjustment = { type, scope:'below', values:Object.fromEntries(definitions[type].controls.map(c=>[c.key,c.initial])) };
  if(type==='curves') a.curves=Object.fromEntries(channels.map(c=>[c,[{x:0,y:0},{x:255,y:255}]])) as Record<Channel,CurvePoint[]>;
  if(type==='photo') a.colors=['#ec8a35'];
  if(type==='gradient') a.colors=['#172341','#f9d8a0'];
  return a;
}
export function isIdentityAdjustment(a: Adjustment): boolean {
  if (a.type === 'lookup') return !a.cube;
  if (a.type === 'curves') return channels.every(c => a.curves![c].every(p => p.x === p.y));
  if (a.type === 'photo') return a.values.density === 0;
  if (['blackwhite','gradient','invert','posterize','threshold'].includes(a.type)) return false;
  return definitions[a.type].controls.every(c => ['preserve','relative'].includes(c.key) || a.values[c.key] === c.initial);
}
const clamp = (x: number, low=0, high=1) => Math.max(low,Math.min(high,x));
const finite = (v: unknown, a: number, b: number): v is number => typeof v==='number' && Number.isFinite(v) && v>=a && v<=b;
export function validateAdjustment(value: unknown): asserts value is Adjustment {
  const a=value as Adjustment;
  if(!a || !Object.hasOwn(definitions,a.type) || !['below','clipped'].includes(a.scope) || !a.values || typeof a.values!=='object' || Array.isArray(a.values)) throw Error('조정 레이어 종류가 올바르지 않습니다.');
  const specs=definitions[a.type].controls;
  if(Object.keys(a.values).length!==specs.length || specs.some(c=>!finite(a.values[c.key],c.min,c.max) || ((c.step??1)===1&&!Number.isInteger(a.values[c.key])))) throw Error('조정 수치가 허용 범위를 벗어났습니다.');
  if(a.type==='levels' && channels.some(c=>a.values[c+'Black']>=a.values[c+'White'])) throw Error('레벨의 입력 검정은 입력 흰색보다 작아야 합니다.');
  if(a.type==='curves') {
    if(!a.curves || channels.some(c=>{const p=a.curves?.[c];return !Array.isArray(p)||p.length<2||p.length>256||p[0]?.x!==0||p.at(-1)?.x!==255||p.some((v,i)=>!v||!finite(v.x,0,255)||!finite(v.y,0,255)||(i>0&&v.x<=p[i-1].x));})) throw Error('곡선 점 데이터가 올바르지 않습니다.');
  } else if(a.curves!==undefined) throw Error('이 조정에는 곡선 데이터가 필요하지 않습니다.');
  const count=a.type==='photo'?1:a.type==='gradient'?2:0;
  if(count ? !Array.isArray(a.colors)||a.colors.length!==count||a.colors.some(c=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c)) : a.colors!==undefined) throw Error('조정 색상 데이터가 올바르지 않습니다.');
  if(a.cube) {
    const c=a.cube;
    if(a.type!=='lookup'||!Number.isInteger(c.size)||!finite(c.size,2,33)||typeof c.name!=='string'||c.name.length>200||!Array.isArray(c.min)||!Array.isArray(c.max)||c.min.length!==3||c.max.length!==3||c.min.some((v,i)=>!finite(v,-100,100)||!finite(c.max[i],-100,100)||v>=c.max[i])||!Array.isArray(c.data)||c.data.length!==c.size**3*3||c.data.some(v=>!finite(v,-16,16))) throw Error('지원하지 않는 3D LUT 데이터입니다.');
  }
}
export function parseCube(text: string, name: string): Cube {
  if(text.length>5*1024*1024)throw Error('LUT 파일은 5MB 이하만 지원합니다.');
  const cube:Cube={size:0,name:name.slice(0,200),min:[0,0,0],max:[1,1,1],data:[]};
  let sizeSeen=false;
  for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const line=raw.split('#')[0].trim();if(!line)continue;
    const [key,...rest]=line.split(/\s+/);
    if(key==='TITLE')continue;
    if(key==='LUT_3D_SIZE'){if(sizeSeen||rest.length!==1)throw Error('중복되거나 잘못된 LUT 크기입니다.');cube.size=Number(rest[0]);sizeSeen=true;if(!Number.isInteger(cube.size)||cube.size<2||cube.size>33)throw Error('2~33 크기의 3D .cube LUT를 지원합니다.');}
    else if(key==='DOMAIN_MIN'||key==='DOMAIN_MAX'){if(rest.length!==3)throw Error('LUT 입력 범위가 올바르지 않습니다.');cube[key==='DOMAIN_MIN'?'min':'max']=rest.map(Number);}
    else {const row=[key,...rest].map(Number);if(row.length!==3||row.some(v=>!Number.isFinite(v)))throw Error('1D LUT·로그 변환 지시문은 지원하지 않습니다. 3D .cube 파일을 선택하세요.');cube.data.push(...row);if(cube.data.length>33**3*3)throw Error('LUT 데이터가 너무 큽니다.');}
  }
  const a=makeAdjustment('lookup');a.cube=cube;validateAdjustment(a);return cube;
}
// Shape-preserving cubic Hermite interpolation: avoids spline overshoot around sharp edits.
export function curveTable(points: CurvePoint[]): Float64Array {
  const n=points.length,d=points.slice(1).map((p,i)=>(p.y-points[i].y)/(p.x-points[i].x));
  const m=points.map((_,i)=>i===0?d[0]:i===n-1?d[n-2]:(d[i-1]*d[i]<=0?0:2/(1/d[i-1]+1/d[i])));
  const out=new Float64Array(256);let j=0;
  for(let x=0;x<256;x++) {while(j<n-2&&x>points[j+1].x)j++;const a=points[j],b=points[j+1],h=b.x-a.x,t=(x-a.x)/h;
    out[x]=clamp((2*t**3-3*t*t+1)*a.y+(t**3-2*t*t+t)*h*m[j]+(-2*t**3+3*t*t)*b.y+(t**3-t*t)*h*m[j+1],0,255)/255;}
  return out;
}
type RGB = [number,number,number];
function hsl(r:number,g:number,b:number,out:RGB):RGB {const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;let h=0;if(d)h=hi===r?((g-b)/d+6)%6:hi===g?(b-r)/d+2:(r-g)/d+4;out[0]=h/6;out[1]=d===0?0:d/(1-Math.abs(2*l-1));out[2]=l;return out;}
function fromHsl(h:number,s:number,l:number,out:RGB){h=((h%1)+1)%1;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h*6)%2-1)),m=l-c/2;
  const k=Math.floor(h*6);out[0]=(k===0||k===5?c:k===1||k===4?x:0)+m;out[1]=(k===1||k===2?c:k===0||k===3?x:0)+m;out[2]=(k===3||k===4?c:k===2||k===5?x:0)+m;}
const luma=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;
function preserveLuma(out:RGB,target:number){const y=luma(...out),delta=target-y;for(let i=0;i<3;i++)out[i]+=delta;
  // Compress chroma toward the target gray to stay in gamut while retaining luminance.
  let scale=1;for(const c of out){if(c<0)scale=Math.min(scale,target/(target-c));if(c>1)scale=Math.min(scale,(1-target)/(c-target));}for(let i=0;i<3;i++)out[i]=target+(out[i]-target)*scale;
}
const hex=(s:string):RGB=>[parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255];
const linear=(s:number)=>s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
const srgb=(s:number)=>s<=.0031308?12.92*s:1.055*s**(1/2.4)-.055;
// Compile once per layer, reusing a 256-entry LUT for separable channel operations.
export function compileAdjustment(a:Adjustment):(r:number,g:number,b:number,out:RGB)=>void {
  const v=a.values,t=a.type;
  if(['brightness','levels','curves','exposure','invert','posterize'].includes(t)) {
    const ct=t==='curves'?Object.fromEntries(channels.map(c=>[c,curveTable(a.curves![c])])) as Record<Channel,Float64Array>:null;
    const tables=['r','g','b'].map(channel=>Float64Array.from({length:256},(_,i)=>{
      let x=i/255;
      if(t==='brightness'){x=v.brightness<0?x*(1+v.brightness/100):x+(1-x)*v.brightness/100;const contrast=v.contrast<0?1+v.contrast/100:1/(1-v.contrast/101);x=(x-.5)*contrast+.5;}
      if(t==='levels')for(const c of ['rgb',channel])x=(v[c+'OutBlack']+(v[c+'OutWhite']-v[c+'OutBlack'])*clamp((x*255-v[c+'Black'])/(v[c+'White']-v[c+'Black']))**(1/v[c+'Gamma']))/255;
      if(t==='curves'){x=ct![channel as Channel][i];const f=clamp(x)*255,lo=Math.floor(f),hi=Math.min(255,lo+1);x=ct!.rgb[lo]+(ct!.rgb[hi]-ct!.rgb[lo])*(f-lo);}
      if(t==='exposure')x=srgb(clamp(linear(x)*2**v.ev+v.offset)**(1/v.gamma));
      if(t==='invert')x=1-x;
      if(t==='posterize')x=Math.round(x*(v.steps-1))/(v.steps-1);
      return clamp(x);
    }));
    return (r,g,b,out)=>{out[0]=tables[0][r];out[1]=tables[1][g];out[2]=tables[2][b];};
  }
  const colors=a.colors?.map(hex),cube=a.cube,scratch:RGB=[0,0,0],weights=new Float64Array(9);
  return (R,G,B,out)=>{
    const r=R/255,g=G/255,b=B/255;out[0]=r;out[1]=g;out[2]=b;
    if(t==='hsl'||t==='vibrance'){
      const [h,s,l]=hsl(r,g,b,scratch);
      if(t==='hsl')fromHsl(h+v.hue/360,clamp(s*(1+v.saturation/100)),v.lightness<0?l*(1+v.lightness/100):l+(1-l)*v.lightness/100,out);
      else fromHsl(h,clamp(s*(1+v.vibrance/100*(1-s))*(1+v.saturation/100)),l,out);
    }
    if(t==='balance'){
      const l=(Math.max(r,g,b)+Math.min(r,g,b))/2,sh=(1-l)**2,hi=l*l,mid=2*l*(1-l);
      for(let c=0;c<3;c++)out[c]=clamp(out[c]+(v['shadows'+'RGB'[c]]*sh+v['midtones'+'RGB'[c]]*mid+v['highlights'+'RGB'[c]]*hi)/100);
      if(v.preserve)preserveLuma(out,luma(r,g,b));
    }
    if(t==='blackwhite'){
      const [h]=hsl(r,g,b,scratch),pos=h*6,i=Math.floor(pos)%6,f=pos-Math.floor(pos),weight=(v['color'+i]*(1-f)+v['color'+((i+1)%6)]*f)/100;
      const gray=clamp(Math.min(r,g,b)+(Math.max(r,g,b)-Math.min(r,g,b))*weight);out.fill(gray);
    }
    if(t==='photo'){
      const amount=v.density/100;
      for(let c=0;c<3;c++)out[c]=out[c]*(1-amount)+colors![0][c]*amount;
      if(v.preserve)preserveLuma(out,luma(r,g,b));
    }
    if(t==='mixer'){
      for(let c=0;c<3;c++){const key=v.mono?'r':'rgb'[c];out[c]=clamp((r*v[key+'R']+g*v[key+'G']+b*v[key+'B']+v[key+'Constant'])/100);}
    }
    if(t==='threshold')out.fill(luma(r,g,b)*255>=v.threshold?1:0);
    if(t==='gradient'){
      let y=luma(r,g,b);if(v.reverse)y=1-y;for(let c=0;c<3;c++)out[c]=colors![0][c]*(1-y)+colors![1][c]*y;
    }
    if(t==='selective'){
      const hi=Math.max(r,g,b),lo=Math.min(r,g,b),mid=r+g+b-hi-lo;
      weights[0]=r===hi?hi-mid:0;weights[1]=b===lo?mid-lo:0;weights[2]=g===hi?hi-mid:0;weights[3]=r===lo?mid-lo:0;weights[4]=b===hi?hi-mid:0;weights[5]=g===lo?mid-lo:0;weights[6]=clamp((lo-.5)*2);weights[7]=1-Math.abs(hi+lo-1);weights[8]=clamp((.5-hi)*2);
      const input=scratch;input[0]=r;input[1]=g;input[2]=b;
      for(let c=0;c<3;c++){let delta=0;for(let k=0;k<9;k++){const ink=v[k+'CMY'[c]]/100,black=v[k+'K']/100;delta+=weights[k]*(ink*(v.relative?(1-input[c]):1)+black*(v.relative?input[c]:1));}out[c]=clamp(input[c]-delta);}
    }
    if(t==='lookup'&&cube){
      const size=cube.size,rx=clamp((r-cube.min[0])/(cube.max[0]-cube.min[0]))*(size-1),gy=clamp((g-cube.min[1])/(cube.max[1]-cube.min[1]))*(size-1),bz=clamp((b-cube.min[2])/(cube.max[2]-cube.min[2]))*(size-1),lr=Math.floor(rx),lg=Math.floor(gy),lb=Math.floor(bz),fr=rx-lr,fg=gy-lg,fb=bz-lb;out.fill(0);
      for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
        const idx=(Math.min(size-1,lr+x)+Math.min(size-1,lg+y)*size+Math.min(size-1,lb+z)*size*size)*3,w=(x?fr:1-fr)*(y?fg:1-fg)*(z?fb:1-fb);
        for(let c=0;c<3;c++)out[c]+=cube.data[idx+c]*w;
      }
    }
    for(let c=0;c<3;c++)out[c]=clamp(out[c]);
  };
}
export type AdjustmentBlend = 'normal'|'multiply'|'screen'|'overlay';
export function adjustPixels(data:Uint8ClampedArray,a:Adjustment,opacity=1,mask?:Uint8ClampedArray,blend:AdjustmentBlend='normal',start=0,end=data.length,compiled=compileAdjustment(a)) {
  const out:RGB=[0,0,0];
  for(let i=start;i<end;i+=4){if(!data[i+3])continue;const amount=opacity*(mask?mask[i+3]/255:1);if(!amount)continue;compiled(data[i],data[i+1],data[i+2],out);
    for(let c=0;c<3;c++){const before=data[i+c]/255;let after=out[c];if(blend==='multiply')after*=before;else if(blend==='screen')after=1-(1-before)*(1-after);else if(blend==='overlay')after=before<.5?2*before*after:1-2*(1-before)*(1-after);data[i+c]=Math.round(clamp(before+(after-before)*amount)*255);}
    // Keep original alpha; compositing a filtered copy with source-over doubles partial alpha.
  }
}
