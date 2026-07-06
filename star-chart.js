// star-chart.js — 同行画面の天球描画
import { sameMembers } from './constellations.js';

const STAR_POSITIONS = {
  yuya: { lon:-18, lat:55 }, rabi: { lon:18, lat:34 },
  shizuku: { lon:43, lat:62 }, kaoru: { lon:61, lat:48 },
  yukika: { lon:35, lat:51 },
  // 仮配置。編集画面を見ながら後で差し替えられる。
  tericia: { lon:-48, lat:43 },
};

const FUTURE_STARS = [
  [-142,31],[-108,68],[-76,44],[-12,76],[67,38],[104,71],[139,49],[172,24],
];
const STAR_CHART_VIEW = { yaw:0, pitch:48, zoom:1 };

function vector(lon,lat) {
  const a=lon*Math.PI/180, b=lat*Math.PI/180, c=Math.cos(b);
  return { x:c*Math.sin(a), y:Math.sin(b), z:c*Math.cos(a) };
}

function random(seed) {
  let value=seed>>>0;
  return () => {
    value+=0x6D2B79F5;
    let mixed=value;
    mixed=Math.imul(mixed^mixed>>>15,mixed|1);
    mixed^=mixed+Math.imul(mixed^mixed>>>7,mixed|61);
    return ((mixed^mixed>>>14)>>>0)/4294967296;
  };
}

const rand=random(0x51A7C0DE);
const BACKGROUND_STARS=Array.from({length:520},() => {
  const y=rand()*2-1, lon=rand()*360-180, lat=Math.asin(y)*180/Math.PI;
  return { point:vector(lon,lat), size:.4+rand()*1.15, alpha:.18+rand()*.62 };
});
const FUTURE_VECTORS=FUTURE_STARS.map(([lon,lat])=>vector(lon,lat));


function createStarChart({
  companions,
  unlocked,
  active,
  busy = [],
  constellations,
  onToggle,
  inspectMode = false,
  inspectedId = null,
  onInspect,
  editor = null,
}) {
  const root=document.createElement('div');
  root.className=`star-chart-layout${inspectMode?' inspect-mode':''}${editor?' editor-mode':''}`;
  root.innerHTML=`
    <section class="star-chart-sky">
      <canvas class="star-chart-canvas"></canvas>
      <div class="star-chart-main-stars"></div>
      <div class="star-chart-overlay">
        <span>星図盤</span>
        <small>${editor?'星を順に選択':`${active.length} / 5`}</small>
      </div>
      <div class="star-chart-caption">THE UNFINISHED SKY</div>
    </section>
    <aside class="star-chart-rail"></aside>`;

  const sky=root.querySelector('.star-chart-sky');
  const canvas=root.querySelector('.star-chart-canvas');
  const starsLayer=root.querySelector('.star-chart-main-stars');
  const rail=root.querySelector('.star-chart-rail');
  const view=STAR_CHART_VIEW;
  const pointers=new Map();
  let gesture=null;
  let suppressStarClickUntil=0;
  const editorMembers=editor
    ? editor.path.filter(id=>id.startsWith('companion:')).map(id=>id.slice(10))
    : [];
  // エディタ演出用の状態: 直近に繋いだ線の伸びアニメーションと、星を拾った時のリップル
  let prevPathLength=editor?editor.path.length:0;
  let lastSegmentAddedAt=-1;
  const ripples=[];

  for (const id of unlocked) {
    const companion=companions[id], position=STAR_POSITIONS[id];
    if (!companion || !position) continue;
    const button=document.createElement('button');
    button.type='button';
    const isSelected=editor?editorMembers.includes(id):active.includes(id);
    button.className=`star-chart-main-star${isSelected?' active':''}${busy.includes(id)?' busy':''}${inspectedId===id?' inspect-selected':''}${editor?.lockedId===id?' locked-origin':''}`;
    button.dataset.companion=id;
    if(companion.color) button.style.setProperty('--star-color', companion.color);
    button.innerHTML=`<span class="star-chart-light"></span><em class="star-chart-name">${companion.starName ?? companion.name}</em>`;
    button.addEventListener('click',()=>{
      if(Date.now()<suppressStarClickUntil)return;
      if(editor) editor.onToggle?.(`companion:${id}`);
      else if(inspectMode) onInspect?.(id);
      else onToggle(id,!active.includes(id));
    });
    starsLayer.appendChild(button);

    const railButton=document.createElement('button');
    railButton.type='button';
    railButton.className=`star-chart-rail-person${isSelected?' active':''}${busy.includes(id)?' busy':''}${inspectedId===id?' inspect-selected':''}`;
    railButton.dataset.companion=id;
    railButton.innerHTML=`<span>${companion.mark??'✦'}</span><small>${companion.name}</small>`;
    railButton.addEventListener('click',()=>{
      if(editor) editor.onToggle?.(`companion:${id}`);
      else if(inspectMode) onInspect?.(id);
      else onToggle(id,!active.includes(id));
    });
    rail.appendChild(railButton);
  }
  for(let index=unlocked.filter(id=>companions[id]&&STAR_POSITIONS[id]).length;index<5;index+=1){
    const placeholder=document.createElement('button');
    placeholder.type='button';
    placeholder.disabled=true;
    placeholder.className='star-chart-rail-person locked';
    placeholder.innerHTML='<span>？</span><small>？？？</small>';
    rail.appendChild(placeholder);
  }

  function frame() {
    const rect=canvas.getBoundingClientRect();
    const yaw=view.yaw*Math.PI/180,pitch=view.pitch*Math.PI/180;
    return {
      width:Math.max(1,rect.width),height:Math.max(1,rect.height),
      scale:Math.min(rect.width,rect.height)*.53*view.zoom,
      forward:{x:Math.cos(pitch)*Math.sin(yaw),y:Math.sin(pitch),z:Math.cos(pitch)*Math.cos(yaw)},
      right:{x:Math.cos(yaw),y:0,z:-Math.sin(yaw)},
      up:{x:-Math.sin(pitch)*Math.sin(yaw),y:Math.cos(pitch),z:-Math.sin(pitch)*Math.cos(yaw)},
    };
  }

  function project(point,f) {
    const depth=point.x*f.forward.x+point.y*f.forward.y+point.z*f.forward.z;
    const horizontal=point.x*f.right.x+point.y*f.right.y+point.z*f.right.z;
    const vertical=point.x*f.up.x+point.y*f.up.y+point.z*f.up.z;
    const angle=Math.acos(Math.max(-1,Math.min(1,depth)));
    if (angle>1.92) return null;
    const length=Math.hypot(horizontal,vertical),radius=f.scale*angle;
    return {x:f.width/2+radius*(length?horizontal/length:0),y:f.height/2-radius*(length?vertical/length:0),depth};
  }

  function drawConnection(context,a,b,f) {
    const start=project(vector(a.lon,a.lat),f),end=project(vector(b.lon,b.lat),f);
    if(!start||!end)return;
    context.beginPath();context.moveTo(start.x,start.y);context.lineTo(end.x,end.y);
    context.strokeStyle='rgba(158,199,255,.96)';context.lineWidth=2;
    context.shadowColor='rgba(100,160,240,.9)';context.shadowBlur=10;context.stroke();context.shadowBlur=0;
  }

  function editorVector(id) {
    if(id.startsWith('companion:')){
      const position=STAR_POSITIONS[id.slice(10)];
      return position?vector(position.lon,position.lat):null;
    }
    if(id.startsWith('background:'))return BACKGROUND_STARS[Number(id.slice(11))]?.point??null;
    return null;
  }

  function editorPoint(id,f) {
    const point=editorVector(id);
    return point?project(point,f):null;
  }

  function draw(now=performance.now()) {
    const f=frame(),ratio=window.devicePixelRatio||1;
    if(canvas.width!==Math.round(f.width*ratio)||canvas.height!==Math.round(f.height*ratio)){
      canvas.width=Math.round(f.width*ratio);canvas.height=Math.round(f.height*ratio);
    }
    const context=canvas.getContext('2d');
    context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,f.width,f.height);
    const matched=editor?null:constellations.find(item=>sameMembers(active,item.members));
    const visiblePath=editor?.path??matched?.path??[];
    for(let index=0;index<BACKGROUND_STARS.length;index+=1){
      const star=BACKGROUND_STARS[index];
      const point=project(star.point,f);
      if(!point||point.x<-4||point.x>f.width+4||point.y<-4||point.y>f.height+4)continue;
      context.beginPath();context.arc(point.x,point.y,star.size*(.7+point.depth*.5),0,Math.PI*2);
      context.fillStyle=`rgba(190,215,250,${star.alpha})`;context.fill();
      if(index%11===0&&(editor||visiblePath.includes(`background:${index}`))){
        const selected=visiblePath.includes(`background:${index}`);
        if(editor){
          // 選択できる小星: 白いコア+ハロー+輪郭リングの3層。未選択はゆっくり明滅して
          // 「繋げられる星」であることを示し、選択済みは白く確定した見た目にする
          const phase=.5+.5*Math.sin(now/900+index*1.7);
          const haloRadius=selected?8:5.5+phase*2;
          const halo=context.createRadialGradient(point.x,point.y,0,point.x,point.y,haloRadius);
          halo.addColorStop(0,selected?'rgba(255,255,255,.95)':`rgba(215,233,252,${.5+phase*.35})`);
          halo.addColorStop(.4,selected?'rgba(190,220,255,.45)':`rgba(160,200,245,${.14+phase*.18})`);
          halo.addColorStop(1,'rgba(160,200,245,0)');
          context.beginPath();context.arc(point.x,point.y,haloRadius,0,Math.PI*2);
          context.fillStyle=halo;context.fill();
          context.beginPath();context.arc(point.x,point.y,selected?2.4:1.8,0,Math.PI*2);
          context.fillStyle=selected?'#fff':`rgba(238,247,255,${.75+phase*.25})`;context.fill();
          context.beginPath();context.arc(point.x,point.y,selected?5:6.5,0,Math.PI*2);
          context.strokeStyle=selected?'rgba(240,250,255,.85)':`rgba(170,205,245,${.2+phase*.3})`;
          context.lineWidth=selected?1.2:1;context.stroke();
        }else{
          context.beginPath();context.arc(point.x,point.y,2.1,0,Math.PI*2);
          context.fillStyle=selected?'rgba(238,249,255,.98)':'rgba(183,211,244,.7)';
          context.fill();
        }
      }
    }
    for(const star of FUTURE_VECTORS){
      const point=project(star,f);if(!point)continue;
      context.beginPath();context.arc(point.x,point.y,2.3,0,Math.PI*2);
      context.fillStyle='rgba(122,151,190,.52)';context.shadowColor='rgba(110,160,225,.4)';
      context.shadowBlur=7;context.fill();context.shadowBlur=0;
    }
    const drawnPath=editor?.path??matched?.path;
    if(drawnPath){
      for(let index=1;index<drawnPath.length;index+=1){
        const fromId=drawnPath[index-1],toId=drawnPath[index];
        const start=editorPoint(fromId,f);let end=editorPoint(toId,f);
        if(!start||!end)continue;
        // 直近に繋いだ線は、終端からスッと伸びるアニメーション
        if(editor&&index===drawnPath.length-1&&lastSegmentAddedAt>=0){
          const t=Math.min(1,(now-lastSegmentAddedAt)/350);
          const eased=1-Math.pow(1-t,3);
          end={x:start.x+(end.x-start.x)*eased,y:start.y+(end.y-start.y)*eased};
        }
        const minor=fromId.startsWith('background:')||toId.startsWith('background:');
        context.beginPath();context.moveTo(start.x,start.y);context.lineTo(end.x,end.y);
        context.strokeStyle=minor?'rgba(169,207,244,.62)':'rgba(158,199,255,.96)';
        context.lineWidth=minor?1:2;
        context.shadowColor=minor?'transparent':'rgba(100,160,240,.9)';
        context.shadowBlur=minor?0:10;context.stroke();context.shadowBlur=0;
      }
    }else{
      const connections=matched?.connections ?? active.slice(1).map((id,index)=>[active[index],id]);
      for(const [from,to] of connections){
        if(STAR_POSITIONS[from]&&STAR_POSITIONS[to])drawConnection(context,STAR_POSITIONS[from],STAR_POSITIONS[to],f);
      }
    }
    if(editor&&editor.path.length){
      // パスの終端(次の線が伸びる場所)に脈動リングを出して、一筆書きの続きを示す
      const endPoint=editorPoint(editor.path[editor.path.length-1],f);
      if(endPoint){
        const pulse=9+2.5*Math.sin(now/260);
        context.beginPath();context.arc(endPoint.x,endPoint.y,pulse,0,Math.PI*2);
        context.strokeStyle='rgba(214,236,255,.55)';context.lineWidth=1.2;context.stroke();
      }
      // 星を拾った瞬間のリップル(広がって消える輪)
      for(let index=ripples.length-1;index>=0;index-=1){
        const age=now-ripples[index].bornAt;
        if(age>450){ripples.splice(index,1);continue;}
        const point=project(ripples[index].point,f);
        if(!point)continue;
        const t=age/450;
        context.beginPath();context.arc(point.x,point.y,6+t*18,0,Math.PI*2);
        context.strokeStyle=`rgba(214,236,255,${.5*(1-t)})`;context.lineWidth=1.4;context.stroke();
      }
    }
    root.querySelector('.star-chart-caption').textContent=editor?'DRAW A NEW CONSTELLATION':matched?matched.name:'THE UNFINISHED SKY';
    starsLayer.querySelectorAll('[data-companion]').forEach(button=>{
      const point=project(vector(STAR_POSITIONS[button.dataset.companion].lon,STAR_POSITIONS[button.dataset.companion].lat),f);
      const visible=point&&point.x>-30&&point.x<f.width+30&&point.y>-30&&point.y<f.height+30;
      button.hidden=!visible;if(visible){button.style.left=`${point.x}px`;button.style.top=`${point.y}px`;}
    });
  }

  function distance(){const values=[...pointers.values()];return values.length<2?0:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
  sky.addEventListener('pointerdown',event=>{
    sky.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    sky.classList.add('panning');
    gesture=pointers.size===1
      ?{type:'pan',x:event.clientX,y:event.clientY,yaw:view.yaw,pitch:view.pitch,moved:false}
      :{type:'pinch',distance:distance(),zoom:view.zoom,moved:true};
  });
  sky.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId)||!gesture)return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size>=2){
      const nextDistance=distance();
      if(gesture.type!=='pinch'){gesture={type:'pinch',distance:nextDistance,zoom:view.zoom,moved:true};return;}
      gesture.moved=true;
      view.zoom=Math.max(.65,Math.min(2.2,gesture.zoom*nextDistance/Math.max(1,gesture.distance)));
    }else if(gesture.type==='pan'){
      const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
      if(Math.hypot(dx,dy)>5)gesture.moved=true;
      view.yaw=((gesture.yaw-dx*.32+540)%360)-180;
      view.pitch=Math.max(5,Math.min(88,gesture.pitch+dy*.24));
    }
    draw();
  });
  function finish(event){
    const completedGesture=gesture;
    if(completedGesture?.moved)suppressStarClickUntil=Date.now()+120;
    if(editor&&completedGesture&&!completedGesture.moved&&!event.target.closest?.('.star-chart-main-star')){
      const rect=canvas.getBoundingClientRect(),f=frame();
      const x=event.clientX-rect.left,y=event.clientY-rect.top;
      let nearest=null;
      for(let index=0;index<BACKGROUND_STARS.length;index+=11){
        const point=project(BACKGROUND_STARS[index].point,f);
        if(!point)continue;
        const gap=Math.hypot(point.x-x,point.y-y);
        if(gap<=22&&(!nearest||gap<nearest.gap))nearest={index,gap};
      }
      if(nearest)editor.onToggle?.(`background:${nearest.index}`);
    }
    pointers.delete(event.pointerId);
    if(!pointers.size){gesture=null;sky.classList.remove('panning');}
    else {const point=[...pointers.values()][0];gesture={type:'pan',x:point.x,y:point.y,yaw:view.yaw,pitch:view.pitch,moved:true};}
  }
  sky.addEventListener('pointerup',finish);sky.addEventListener('pointercancel',finish);
  if(globalThis.ResizeObserver){
    const canvasObserver=new ResizeObserver(()=>{
      if(!root.isConnected){canvasObserver.disconnect();return;}
      const available=Math.max(64,root.clientHeight);
      root.classList.toggle('compact',available<180);
      root.classList.toggle('ultra-compact',available<105);
      draw();
    });
    canvasObserver.observe(canvas);
    canvasObserver.observe(root);
  }

  // エディタからパス変更を反映するための更新API。DOMを作り直さず、選択クラスと演出タイマーだけ更新する
  function refreshEditorState() {
    if(!editor)return;
    const members=editor.path.filter(id=>id.startsWith('companion:')).map(id=>id.slice(10));
    root.querySelectorAll('[data-companion]').forEach(button=>{
      button.classList.toggle('active',members.includes(button.dataset.companion));
    });
    if(editor.path.length>prevPathLength){
      lastSegmentAddedAt=performance.now();
      const point=editorVector(editor.path[editor.path.length-1]);
      if(point)ripples.push({point,bornAt:lastSegmentAddedAt});
    }
    prevPathLength=editor.path.length;
  }
  root.chartApi={redraw:()=>draw(),refreshEditorState};

  // エディタ中だけ描画ループを回す(明滅・脈動リング・線の伸び・リップルのため)。
  // 通常の星図盤は従来どおりジェスチャ/リサイズ時のみ再描画(常時ループのバッテリー消費を避ける)
  if(editor){
    let started=false;
    const animate=()=>{
      if(started&&!root.isConnected)return;
      if(root.isConnected)started=true;
      draw();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
  return root;
}

export { STAR_POSITIONS, BACKGROUND_STARS, createStarChart };
