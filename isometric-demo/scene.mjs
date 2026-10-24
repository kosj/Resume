import * as GS from '../assets/kits/game-scene.js';
const {THREE}=GS,W=1920,H=1080,DURATION=16;
if(new URLSearchParams(location.search).has('render'))document.documentElement.classList.add('render');
const ctx=document.getElementById('c').getContext('2d');
const stage=GS.createStage({W,H,sky:null,background:'#e9efe6',tone:'aces',exposure:1.1,shadows:{size:512,extent:15},hemi:{sky:'#f5fff4',ground:'#879c8c',intensity:2},sun:{color:'#fff0d6',intensity:2.5}});
stage.gl.setSize(1280,720,false);stage.sun.position.set(-6,14,9);stage.sun.target.position.set(0,0,0);
const orthographic=new THREE.OrthographicCamera(-9.6,9.6,5.4,-5.4,.1,100);orthographic.position.set(8,8,8);orthographic.lookAt(0,0,0);orthographic.updateMatrixWorld();
const P=GS.painter(ctx,{sans:'Pretendard,sans-serif',mono:'"JetBrains Mono",monospace',theme:{text:'#233e35',dim:'#577064',panel:'#f7faf3',line:'#bfcec1'}}),{txt,panel,line}=P;
const text=(s,x,y,size=30,color='#233e35',q={})=>txt(s,x,y,{size,color,...q});
function box(size,pos,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),GS.flatMat(color));mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;stage.scene.add(mesh);return mesh;}
box([10,.2,8],[0,-.13,0],'#a5bba3');const grid=new THREE.GridHelper(10,10,'#739a7e','#8ba88e');grid.position.y=.01;stage.scene.add(grid);
box([1.25,1.25,1.25],[-2,.625,-2],'#efba7d');box([1.25,1.25,1.25],[2,.625,2],'#efba7d');
box([2,1.8,1.5],[.3,.9,-.7],'#b7cbd0');const roof=new THREE.Mesh(new THREE.ConeGeometry(1.65,1.2,4),GS.flatMat('#7b9db1'));roof.position.set(.3,2.4,-.7);roof.rotation.y=Math.PI/4;stage.scene.add(roof);
box([.45,1.3,2],[1.3,.65,1],'#6f9b82');
const texture=GS.canvasTex(128,192,g=>{g.clearRect(0,0,128,192);g.fillStyle='#263b54';g.fillRect(37,16,54,42);g.fillStyle='#efc49d';g.fillRect(43,35,42,33);g.fillStyle='#d3904e';g.fillRect(34,71,60,64);g.fillStyle='#f2d3aa';g.fillRect(18,78,16,50);g.fillRect(94,78,16,50);g.fillStyle='#334d63';g.fillRect(37,135,22,48);g.fillRect(69,135,22,48);g.fillStyle='#f2ebcd';g.fillRect(46,51,8,5);g.fillRect(73,51,8,5);});
const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,alphaTest:.5,depthWrite:true,transparent:false}));sprite.scale.set(1.2,1.8,1);stage.scene.add(sprite);
const axes=new THREE.AxesHelper(2.2);axes.position.set(-3,.08,1);stage.scene.add(axes);
function renderAt(t){
  const phase=Math.min(3,Math.floor(t/4)),local=t-phase*4;
  const camera=phase===0?stage.camera:orthographic;
  if(phase===0){stage.camera.position.set(7+Math.sin(t*.3)*2,6,10);stage.camera.lookAt(0,0,0);stage.camera.fov=45;stage.camera.updateProjectionMatrix();stage.camera.updateMatrixWorld();}
  sprite.visible=phase>=2;sprite.position.set(phase===3?-1.5+local:Math.sin(local)*1.7,.95,phase===3?.7:-1.7);
  stage.gl.render(stage.scene,camera);ctx.drawImage(stage.gl.domElement,0,0,W,H);
  panel(100,35,1720,165,{fill:'rgba(247,250,243,.96)',stroke:null});
  text('ISOMETRIC / 3D + 2D',130,86,24,'#496b58',{mono:true});
  const titles=['엔진 씬에는 3D 오브젝트를 배치','직교 카메라로 비스듬히 내려다보기','같은 공간에 2D 스프라이트 배치','3D 물체의 앞뒤로 움직이며 깊이 가림'];
  text(titles[phase],130,158,47,'#233e35',{weight:800});
  panel(100,835,1720,205,{fill:'rgba(247,250,243,.97)',stroke:null});
  const captions=['원근 카메라: 가까운 물체가 더 크게 보입니다.','직교 투영: 거리에 따른 크기 변화 없이 평행선이 유지됩니다.','캐릭터는 평면 그림, 배경·건물은 3D 메시로 함께 표현할 수 있습니다.','깊이 검사와 투명 영역 처리로 스프라이트가 3D 물체 뒤에서 가려집니다.'];
  text(captions[phase],130,889,32,'#233e35',{weight:600});
  text(phase===1?'예시: 수평 45° · 고도 35.264° · 화면의 세 축 120°':'같은 3D 공간 · 카메라와 표현 방식을 조합하는 원리',130,940,28,'#496b58');
  text('별도 개념 시연 · 실제 프로젝트 화면·카메라 설정 아님',130,996,23,'#577064');
}
window.renderAt=renderAt;window.DURATION=DURATION;window.ready=Promise.all([document.fonts.load('500 30px Pretendard'),document.fonts.load('500 24px "JetBrains Mono"')]).then(()=>renderAt(6));
let playing=false,last=0,t=0;
document.getElementById('play').onclick=()=>{playing=!playing;last=performance.now();document.getElementById('play').textContent=playing?'일시정지':'애니메이션 재생';};
function frame(now){if(playing){t=(t+(now-last)/1000)%DURATION;renderAt(t);}last=now;requestAnimationFrame(frame);}
if(!document.documentElement.classList.contains('render'))window.ready.then(()=>{last=performance.now();requestAnimationFrame(frame);});
