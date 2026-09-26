import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DURATION = 180;
const TAU = Math.PI * 2;
const WORLD = 320;
const CHUNK = 40;
const SPEED = WORLD * 3 / DURATION;
let seed = 92;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const wrap = (n, len) => ((n % len) + len) % len;
const materials = new Map();
const finishes = {
  plaster: { roughness: .9 },
  paint: { roughness: .3, metalness: .05 },
  steel: { roughness: .36, metalness: .85 },
  rubber: { roughness: .96 },
  fabric: { roughness: 1 },
  // Opaque tinted windows keep reflections without a transmission render pass.
  glass: { roughness: .16, metalness: 0, envMapIntensity: 1.3 },
};
function mat(color, finish = 'plaster') {
  const key = `${finish}:${color}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, ...finishes[finish] }));
  }
  return materials.get(key);
}

function createEnvironment(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#8baebf');
  sky.addColorStop(.45, '#d9e4df');
  sky.addColorStop(.55, '#c9bd9f');
  sky.addColorStop(1, '#655e4e');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(texture);
  texture.dispose();
  generator.dispose();
  return environment;
}
const C = { cream:'#e7d7b0', dark:'#293c3a', steel:'#647577', red:'#c34832', yellow:'#e5b84d', green:'#477862', blue:'#658b9a', tire:'#28302d', skin:'#bf8c63', leaf:'#568051', white:'#f1e9cf' };
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 10, 7);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE = new THREE.ConeGeometry(1, 1, 12);
function mesh(parent, geo, color, x, y, z, sx=1, sy=1, sz=1, rx=0, ry=0, rz=0) {
  const o = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
  o.position.set(x,y,z); o.scale.set(sx,sy,sz); o.rotation.set(rx,ry,rz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}
function box(p,c,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0) { return mesh(p,BOX,c,x,y,z,sx,sy,sz,rx,ry,rz); }
function ball(p,c,x,y,z,sx,sy=sx,sz=sx) { return mesh(p,SPHERE,c,x,y,z,sx,sy,sz); }
function cyl(p,c,x,y,z,r,h,rx=0,rz=0) { return mesh(p,CYL,c,x,y,z,r,h,r,rx,0,rz); }
function rod(p,c,a,b,r=.025) {
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b), d=bv.clone().sub(av);
  const o=cyl(p,c,...av.clone().add(bv).multiplyScalar(.5).toArray(),r,d.length());
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;
}
function batch(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const remove = [];
  group.traverse(object => {
    if (!object.isMesh || object.userData.unbatch) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    // Shadow flags are part of the batch identity so roads stay receive-only.
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        material: object.material,
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
        geometries: [],
      });
    }
    buckets.get(key).geometries.push(geometry);
    remove.push(object);
  });
  remove.forEach(object => object.removeFromParent());
  for (const { material, castShadow, receiveShadow, geometries } of buckets.values()) {
    const object = new THREE.Mesh(mergeGeometries(geometries, false), material);
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
    group.add(object);
    geometries.forEach(geometry => geometry.dispose());
  }
  return group;
}
const signCache = new Map();
function signMaterial(title, subtitle, bg, fg, vertical=false) {
  const key=[title,subtitle,bg,fg,vertical].join('|');if(signCache.has(key))return signCache.get(key);
  const canvas=document.createElement('canvas');canvas.width=vertical?256:1024;canvas.height=vertical?768:320;
  const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle=fg;ctx.lineWidth=4;ctx.strokeRect(12,12,canvas.width-24,canvas.height-24);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fg;
  if(vertical){const words=title.split(' ');ctx.font='900 70px Arial';words.forEach((s,i)=>ctx.fillText(s,128,130+i*130,225));ctx.font='22px Arial';ctx.fillText(subtitle,128,690,210);}else{
    ctx.font='500 24px Arial';ctx.fillText('ĐẶC SẢN SÀI GÒN  •  TỪ 1998',512,53,940);
    ctx.font='900 115px Arial';ctx.fillText(title,512,158,945);
    ctx.font='500 31px Arial';ctx.fillText(subtitle,512,263,930);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.8,side:THREE.DoubleSide});signCache.set(key,material);return material;
}
function sign(p,title,subtitle,bg,fg,x,y,z,w,h,ry=0,vertical=false) {
  box(p,C.dark,x,y,z,w+.1,h+.1,.15,0,ry);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),signMaterial(title,subtitle,bg,fg,vertical));
  plane.position.set(x-Math.sin(ry)*.09,y,z-Math.cos(ry)*.09);plane.rotation.y=ry+Math.PI;p.add(plane);if(vertical){const back=plane.clone();back.position.set(x+Math.sin(ry)*.09,y,z+Math.cos(ry)*.09);back.rotation.y=ry;p.add(back);}return plane;
}
const shops=[
  ['CÀ PHÊ','CÀ PHÊ SỮA ĐÁ  •  20K','#244e42','#f5dfad'],
  ['PHỞ BÒ','PHỞ TÁI • NẠM • GẦU','#b6422b','#fff0b8'],
  ['BÁNH MÌ','NÓNG GIÒN MỖI NGÀY','#e3b744','#a53929'],
  ['TẠP HÓA','BIA • NƯỚC NGỌT • BÁNH KẸO','#397e92','#f3edcb'],
  ['CƠM TẤM','SƯỜN • BÌ • CHẢ','#e3d4a1','#af3627'],
  ['SỬA XE','HONDA • VÁ VỎ • THAY NHỚT','#365d73','#f2e4bd'],
  ['BÚN BÒ HUẾ','CÔ BA  •  KÍNH MỜI','#b93f32','#f6d774'],
  ['HỚT TÓC','THANH NAM  •  MÁY LẠNH','#e6d9b7','#315648'],
  ['TRÁI CÂY','TƯƠI NGON MỖI NGÀY','#49734b','#ffeaab'],
  ['NHÀ THUỐC','DƯỢC PHẨM • TƯ VẤN','#e8e2c7','#377965'],
  ['BIA HƠI','LAI RAI • CHUYỆN TRÒ','#c14730','#f3df9f'],
  ['ĐIỆN THOẠI','MUA BÁN • SỬA CHỮA','#e9bc3a','#b92f24']
];
function plant(p,x,y,z,size=.8) {
  cyl(p,'#a76243',x,y+.2*size,z,.26*size,.4*size);
  rod(p,C.green,[x,y+.3*size,z],[x,y+1.15*size,z],.035);
  for(let i=0;i<5;i++){const a=i*TAU/5;ball(p,pick(['#54764c','#729053','#3e6750']),x+Math.cos(a)*.21*size,y+(.65+i*.12)*size,z+Math.sin(a)*.2*size,.24*size,.12*size,.24*size);}
}
function stool(p,x,z,color=C.red) {
  box(p,color,x,.54,z,.44,.12,.44);
  for(const a of [-1,1])for(const b of [-1,1])box(p,color,x+a*.15,.32,z+b*.15,.055,.4,.055);
}
function person(p,x,z,shirt,angle=0,sitting=false,hat=false) {
  const g=new THREE.Group();
  const y=sitting?.45:0;
  box(g,shirt,0,1.18-y,0,.43,.58,.3,0,0,-.03);
  ball(g,C.skin,0,1.65-y,0,.19,.24,.19);
  ball(g,'#292f2a',0,1.82-y,.03,.19,.1,.19);
  if(hat)mesh(g,CONE,'#d8bf83',0,1.95-y,0,.43,.22,.43);
  for(const side of [-1,1]){
    rod(g,C.skin,[side*.23,1.4-y,0],[side*.3,.93-y,-.15],.075);
    if(sitting){rod(g,'#36474b',[side*.12,.6,0],[side*.12,.55,-.38],.1);rod(g,'#36474b',[side*.12,.55,-.38],[side*.12,.2,-.38],.085);}
    else rod(g,'#36474b',[side*.12,.92,0],[side*.14,.16,side*.07],.095);
    box(g,C.dark,side*.14,.15,sitting?-.4:-.07,.19,.13,.3);
  }
  g.position.set(x,0,z);g.rotation.y=angle;p.add(g);return g;
}
function dog(p,x,z,angle=0) {
  const g=new THREE.Group(); const fur=pick(['#b58b54','#dfc18a','#ece2c6']);
  ball(g,fur,0,.48,0,.2,.22,.43);ball(g,fur,0,.68,-.36,.19,.21,.21);
  ball(g,fur,0,.6,-.53,.12,.1,.17);ball(g,C.dark,0,.63,-.68,.06);
  for(const a of [-1,1]){mesh(g,CONE,fur,a*.13,.89,-.31,.09,.22,.08,0,0,a*-.2);ball(g,C.dark,a*.15,.72,-.47,.025);for(const b of [-1,1])rod(g,fur,[a*.12,.45,b*.26],[a*.15,.12,b*.3],.055);}
  rod(g,fur,[0,.55,.36],[0,.83,.62],.055);g.position.set(x,.18,z);g.rotation.y=angle;p.add(g);
}
function umbrella(p,x,z,color) {
  cyl(p,mat(C.steel, 'steel'),x,1.45,z,.035,2.7);
  const cap=mesh(p,CONE,color,x,2.8,z,1.5,.55,1.5);cap.rotation.y=.3;
  cyl(p,color,x,2.53,z,1.5,.1);
  for(let i=0;i<8;i++){const a=i*TAU/8;rod(p,C.cream,[x,3.05,z],[x+Math.cos(a)*1.47,2.51,z+Math.sin(a)*1.47],.014);}
}
function cart(p,x,z,color) {
  box(p,mat(C.steel, 'steel'),x,.85,z,1,.9,1.5);box(p,color,x,1,z+.76,.95,.55,.03);
  for(const a of [-1,1])for(const b of [-1,1]){cyl(p,mat(C.tire, 'rubber'),x+a*.52,.3,z+b*.55,.18,.07,0,Math.PI/2);rod(p,mat(C.steel, 'steel'),[x+a*.45,1.2,z+b*.7],[x+a*.45,2.2,z+b*.7],.027);}
  box(p,C.cream,x,2.2,z,1.2,.1,1.8);box(p,C.yellow,x,1.4,z,.8,.13,1.3);
  for(let i=0;i<6;i++)ball(p,'#d4a74e',x-.3+(i%2)*.35,1.54,z-.45+Math.floor(i/2)*.4,.13,.09,.21);
}
export function makeScooter(color,shirt,helmet,passenger=false) {
  const g=new THREE.Group();
  const paint = mat(color, 'paint');
  const clothing = mat(shirt, 'fabric');
  for(const z of [-.7,.65]){cyl(g,mat(C.tire, 'rubber'),0,.37,z,.34,.2,0,Math.PI/2);cyl(g,mat(C.steel, 'steel'),0,.37,z,.2,.22,0,Math.PI/2);cyl(g,C.dark,0,.37,z,.06,.25,0,Math.PI/2);}
  box(g,C.dark,0,.56,.12,.42,.13,1.25);
  ball(g,paint,0,.77,.52,.34,.37,.49);box(g,paint,0,.76,-.67,.5,.77,.22,.18);
  ball(g,paint,0,1.24,-.65,.3,.16,.16);box(g,C.cream,0,1.25,-.8,.26,.13,.04);
  box(g,C.dark,0,1.02,.38,.53,.13,.8);box(g,'#b94b30',0,.83,.94,.33,.13,.05);
  box(g,C.white,0,.57,.99,.25,.17,.025);box(g,mat(C.steel, 'steel'),.25,.32,.47,.09,.12,.65);
  rod(g,C.dark,[-.42,1.23,-.62],[.42,1.23,-.62],.045);
  for(const a of [-1,1]){rod(g,mat(C.steel, 'steel'),[a*.31,1.27,-.63],[a*.42,1.58,-.69],.018);ball(g,C.dark,a*.43,1.58,-.69,.105,.07,.035);}
  box(g,clothing,0,1.49,.19,.57,.72,.38,-.12);
  ball(g,C.skin,0,1.97,.1,.22,.25,.21);ball(g,mat(helmet, 'paint'),0,2.09,.12,.26,.24,.25);
  box(g,C.cream,0,1.9,-.08,.28,.09,.04);
  for(const a of [-1,1]){rod(g,clothing,[a*.28,1.73,.09],[a*.38,1.38,-.24],.105);rod(g,C.skin,[a*.38,1.38,-.24],[a*.36,1.23,-.6],.075);rod(g,'#344952',[a*.2,1.11,.28],[a*.32,.88,-.12],.13);rod(g,'#344952',[a*.32,.88,-.12],[a*.28,.56,.03],.095);box(g,C.cream,a*.28,.55,-.05,.18,.12,.33);}
  if(passenger){box(g,'#e6b44e',0,1.47,.69,.5,.58,.32);ball(g,C.skin,0,1.94,.69,.2,.22,.19);ball(g,C.red,0,2.04,.69,.24,.22,.23);}
  return batch(g);
}
function storefront(p,side,z,index) {
  const g=new THREE.Group();const width=6.25;const depth=5+rand()*3;const height=7.5+Math.floor(rand()*4)*2.6;
  const wall=pick(['#d3bb88','#c8c8ac','#e4cea3','#b6c7be','#cba38f','#90aaa4','#e1d6ba','#c5b47c']);
  box(g,wall,0,height/2,depth/2,width,height,depth);
  box(g,'#405451',0,1.6,-.04,5.7,2.85,.1);
  box(g,'#9d9177',2.55,1.5,-.14,.36,2.8,.12);
  box(g,'#b6a887',-2.64,1.5,-.14,.3,2.8,.12);
  // Open shop interiors read as layered shelves behind a shaded arcade.
  for(let y=.65;y<2.6;y+=.65){box(g,C.cream,0,y,.08,4.6,.055,.18);for(let i=0;i<8;i++)box(g,pick([C.red,C.yellow,C.green,C.blue,C.cream]),-2.1+i*.58,y+.2,-.04,.27,.32,.18);}
  const shop=shops[index%shops.length];sign(g,...shop,0,3.55,-.22,6.04,1.38);
  for(let level=4.9;level<height-.7;level+=2.65){
    for(const x of [-1.55,1.45]){box(g,C.cream,x,level+.52,-.09,1.7,1.98,.2);box(g,mat('#385754', 'glass'),x,level+.54,-.21,1.43,1.7,.09);box(g,wall,x,level+.53,-.28,.07,1.7,.05);box(g,C.cream,x,level+.5,-.28,1.45,.05,.05);}
    if(rand()>.28){box(g,wall,0,level-.43,-.57,5.9,.18,1.35);rod(g,C.dark,[-2.9,level+.35,-1.16],[2.9,level+.35,-1.16]);for(let x=-2.8;x<3;x+=.34)rod(g,C.dark,[x,level-.35,-1.16],[x,level+.35,-1.16],.019);plant(g,-1.8,level-.35,-.6,.85);if(rand()>.4){rod(g,C.dark,[-2,level+1,-.8],[2.3,level+1,-.8],.015);for(let j=0;j<4;j++)box(g,pick([C.red,C.white,C.blue,C.yellow]),-.9+j*.7,level+.7,-.81,.45,.6,.04);}}
    box(g,'#c3c3af',2.43,level+.45,-.36,.72,.52,.4);for(let j=0;j<5;j++)box(g,mat(C.steel, 'steel'),2.43,level+.28+j*.07,-.58,.55,.02,.02);
  }
  box(g,C.cream,0,height+.1,depth/2,width+.25,.22,depth+.25);
  cyl(g,mat(C.steel, 'steel'),1.5,height+.85,2,.65,1.4);rod(g,C.dark,[-2,height,1],[-2,height+2.8,1],.025);rod(g,C.dark,[-2.8,height+2.3,1],[-1.2,height+2.3,1],.02);
  // Striped fabric awnings project well beyond the shop line.
  for(let i=0;i<10;i++)box(g,i%2===0?shop[2]:C.cream,-2.82+i*.625,2.72,-1.03,.63,.08,1.95,-.16);
  box(g,shop[2],0,2.57,-1.99,6.2,.25,.05);
  if(index%2===0){sign(g,shop[0],index%4?'24/7':'KÍNH MỜI',shop[2],shop[3],-2.88,4.5,-1.15,1.06,2.8,Math.PI/2,true);}
  if(index%3===0){sign(g,index%2?'PHỞ':'CÀ PHÊ','20K',shop[3],shop[2],1.8,1.15,-2.4,1.15,1.65,.2);rod(g,C.dark,[1.2,.2,-2.5],[1.2,1.9,-2.4],.035);}
  if(index%3===1){cart(g,-1.8,-2.65,C.red);person(g,-1.7,-1.7,C.cream,Math.PI,false,true);}
  else if(index%3===2){for(let i=0;i<3;i++){box(g,'#886b46',-1.9+i*1.25,.48,-1.2,1.1,.55,.8);for(let j=0;j<8;j++)ball(g,i===0?'#e7ad39':i===1?'#72904c':'#b85b35',-2.3+i*1.25+(j%4)*.23,.84,-1.45+Math.floor(j/4)*.32,.13);}person(g,2,-1,C.blue,0,false,true);}
  else {cyl(g,mat(C.steel, 'steel'),-1.2,.9,-2.2,.53,.08);cyl(g,mat(C.steel, 'steel'),-1.2,.55,-2.2,.035,.7);stool(g,-2,-2.5);stool(g,-.5,-2.4,C.blue);person(g,-2,-2.5,C.cream,-1.4,true);cyl(g,C.cream,-1.2,1.01,-2.2,.08,.15);}
  if(index%4===0)umbrella(g,1,-2.6,pick([C.green,C.red,C.yellow]));
  plant(g,2.65,.18,-1.2,1);
  if(index%5===0)dog(g,.2,-3.1,1);
  g.rotation.y=side===1?Math.PI/2:-Math.PI/2;g.position.set(side*10, .18,z);p.add(g);
}
function tree(p,x,z) {
  cyl(p,'#6f6c51',x,2.1,z,.19,4.2);rod(p,'#6f6c51',[x,2.8,z],[x+.8,4.6,z+.3],.12);
  for(let i=0;i<5;i++)ball(p,pick(['#5b805c','#698859','#7a945f']),x+(rand()-.5)*2.1,4.6+rand()*1.4,z+(rand()-.5)*2.2,1.35,1,1.3);
  box(p,'#a29d82',x,.24,z,1.2,.18,1.2);
}
function wire(p,a,b,sag=.8) {
  const mid=new THREE.Vector3((a[0]+b[0])/2,(a[1]+b[1])/2-sag,(a[2]+b[2])/2);
  const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a),mid,new THREE.Vector3(...b));
  mesh(p,new THREE.TubeGeometry(curve,14,.018,4,false),'#394842',0,0,0);
}
function createChunk(index) {
  const g=new THREE.Group();
  const road = box(g,'#858782',0,-.14,0,12,.25,CHUNK);
  road.castShadow = false;
  for(const side of [-1,1]){
    box(g,'#b9b59e',side*8,.04,0,4,.34,CHUNK);
    box(g,'#ddd1ab',side*6.08,.12,0,.16,.33,CHUNK);
    for(let z=-20;z<20;z+=2){box(g,'#9e9f8e',side*8,.219,z,3.8,.012,.022);}
    for(let j=0;j<6;j++)storefront(g,side,-16.7+j*6.65,index*12+j+(side===1?6:0));
    for(const z of [-12,12]){tree(g,side*6.8,z);const bike=makeScooter(pick([C.red,C.blue,C.cream,C.green]),C.cream,C.cream);bike.position.set(side*7.8,.18,z+2);bike.rotation.y=side*1.05;bike.scale.setScalar(.8);g.add(bike);}
    cyl(g,'#8a8f7e',side*6.6,3.5,-4,.12,7);box(g,C.dark,side*6.6,5.65,-4,.42,.7,.24);
    rod(g,mat(C.steel, 'steel'),[side*6.6,6.9,-4],[side*4.3,7.1,-4],.055);box(g,C.cream,side*4.3,7.05,-4,.65,.12,.26);
    for(let i=0;i<5;i++)wire(g,[side*6.6,6+i*.1,-20],[side*6.6,6+i*.1,20],.5+i*.08);
    person(g,side*6.65,-7,pick([C.cream,C.red,C.blue]),side*1.2,false,index%2===0);
    for(let i=0;i<5;i++)box(g,'#4d5751',side*5.75,.006,-2+i*.14,.35,.01,.06);
  }
  wire(g,[-6.6,6.5,-4],[6.6,6.5,-2],1.3);wire(g,[-6.6,6.7,-4],[6.6,6.7,-2],1.1);
  for(let z=-18;z<20;z+=8)box(g,'#dbc994',0,.002,z,.12,.012,3.2);
  if(index%3===1){for(let x=-5;x<6;x+=1.1)box(g,'#d5cfb2',x,.006,15,.57,.012,3);}
  for(let i=0;i<8;i++){box(g,'#737b76',(rand()-.5)*10,.006,(rand()-.5)*40,.2+rand(),.009,.04,0,rand()*3);}
  return batch(g);
}
function makeVan() {
 const g=new THREE.Group();box(g,'#d8cfae',0,1.16,0,1.85,1.65,3.5);box(g,C.green,0,.67,0,1.9,.35,3.6);box(g,mat('#436366', 'glass'),0,1.58,-1.76,1.62,.67,.02);box(g,mat('#436366', 'glass'),0,1.59,1.76,1.6,.6,.02);
 for(const a of [-1,1]){for(const z of [-1.15,1.15])cyl(g,mat(C.tire, 'rubber'),a*.94,.43,z,.38,.15,0,Math.PI/2);box(g,C.cream,a*.65,.91,-1.8,.31,.2,.05);box(g,C.red,a*.7,.89,1.8,.17,.25,.05);box(g,mat('#436366', 'glass'),a*.94,1.6,-.75,.02,.64,1.3);}return batch(g);
}
export function createWorld(container) {
  seed = 92;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d4dfd5');scene.fog=new THREE.Fog('#d4dfd5',37,125);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;container.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.1,180);
  const environment = createEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = .55;
  scene.add(new THREE.HemisphereLight('#dceaf0','#ad9879',1.35));
  const sun=new THREE.DirectionalLight('#fff0d8',3.1);sun.position.set(-19,29,-22);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-29,right:29,top:40,bottom:-40,near:1,far:100});sun.shadow.bias=-.0002;sun.shadow.normalBias=.035;sun.target.position.set(0,0,-18);scene.add(sun,sun.target);
  const ground=box(scene,'#858782',0,-.32,-60,180,.1,240);ground.castShadow=false;
  const chunks=[];for(let i=0;i<WORLD/CHUNK;i++){const chunk=createChunk(i);scene.add(chunk);chunks.push(chunk);}
  const rider=makeScooter('#b64d33','#e4b947','#e7d8b0');rider.scale.setScalar(1.08);scene.add(rider);
  // Small luggage and helmet stripe make the followed rider easy to recognize.
  box(rider,'#587664',0,1.5,.46,.42,.52,.19);rod(rider,'#d2be8f',[-.2,1.73,.32],[-.2,1.21,.32],.026);rod(rider,'#d2be8f',[.2,1.73,.32],[.2,1.21,.32],.026);
  const traffic=[];
  for(let i=0;i<45;i++){
    const oncoming=i%4===0;const bike=makeScooter(pick([C.red,C.blue,C.cream,C.green,'#59555c','#bf9c62']),pick([C.white,C.blue,C.red,C.green,'#dda14a','#8c7886']),pick([C.white,C.red,C.blue,C.yellow]),i%7===0);
    const lane=oncoming?-3.1-(i%3)*.7:1.2+(i%3)*1.5;const span=160;const cycles=oncoming?9:pick([2,3,4]);
    if(i%8===0){box(bike,'#ae8657',0,1.37,.9,.83,.64,.58);box(bike,C.cream,0,1.7,.9,.86,.04,.6);rod(bike,C.dark,[-.25,1.72,.63],[-.25,1.72,1.2],.025);}
    bike.rotation.y=oncoming?Math.PI:0;scene.add(bike);traffic.push({object:bike,lane,offset:-i*span/45,cycles,span,oncoming,phase:rand()*TAU});
  }
  const van=makeVan();scene.add(van);
  // Distant roof silhouettes keep the vanishing point embedded in the city.
  for(let i=0;i<18;i++)box(scene,pick(['#a9bfb5','#b6c6b9','#b1bbb0']), (i-9)*9,8+rand()*8,-140,7,16+rand()*16,10);
  let lookX=0,lookY=0;
  const pointer={x:0,y:0};
  function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
  function render(time,started=false,dt=1/60,steering={x:1.15,lean:0}){
    const t=wrap(time,DURATION),phase=t/DURATION*TAU,travel=t*SPEED;
    chunks.forEach((g,i)=>{g.position.z=wrap(i*CHUNK+travel+40,WORLD)-WORLD+40;});
    const riderX=steering.x;
    rider.position.set(riderX,.014+Math.sin(phase*360)*.013,3);rider.rotation.z=-steering.lean*.14;rider.rotation.y=-steering.lean*.10;
    for(const car of traffic){const z=wrap(car.offset+t/DURATION*car.span*car.cycles+20,car.span)-car.span+20;let x=car.lane+Math.sin(phase*car.cycles+car.phase)*.3;const clearance=Math.exp(-Math.pow((z-3)/5,2));if(!car.oncoming&&car.lane<2)x+=clearance*1.3;car.object.position.set(x,.014,z);car.object.rotation.z=Math.cos(phase*car.cycles+car.phase)*.018;}
    van.position.set(-3.7,0,wrap(-60+t/DURATION*540,180)-145);van.rotation.y=Math.PI;
    lookX+=(pointer.x-lookX)*Math.min(1,dt*2);lookY+=(pointer.y-lookY)*Math.min(1,dt*2);
    const mobile=innerWidth<700;
    camera.position.set(riderX+(started?-.15: -2.1)+lookX*.6,(mobile?5.2:4.6)+lookY*.25,started?14:15);
    camera.lookAt(riderX+(started?0:2.8)+lookX*1.6,1.8+lookY*.5,-19);
    renderer.render(scene,camera);
  }
  function dispose() {
    const geometries = new Set();
    const usedMaterials = new Set();
    scene.traverse(object => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      usedMaterials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    usedMaterials.forEach(material => {
      material.map?.dispose();
      material.dispose();
    });
    environment.dispose();
    materials.clear();
    signCache.clear();
    renderer.dispose();
    renderer.domElement.remove();
  }
  return {render,resize,dispose,pointer,renderer,scene,camera,getStats:()=>({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures})};
}
