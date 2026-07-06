// constellation-editor.js — 星図盤の天球をそのまま利用する星座編集画面
import { createStarChart } from './star-chart.js';

function openConstellationEditor({
  companions,
  unlocked,
  initialPath = ['companion:tericia'],
  lockedId = 'tericia',
  onComplete,
}) {
  document.querySelector('.constellation-editor-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.className='constellation-editor-overlay';
  let path=[...initialPath];
  let name='';

  function companionMembers(){
    return [...new Set(path
      .filter(id=>id.startsWith('companion:'))
      .map(id=>id.slice(10)))];
  }

  function toggle(id){
    const companionId=id.startsWith('companion:')?id.slice(10):null;
    if(companionId===lockedId)return;
    const index=path.indexOf(id);
    if(index>=0)path.splice(index,1);
    else if(path.length<12)path.push(id);
    render();
  }

  function render(){
    overlay.innerHTML=`
      <div class="constellation-editor-head">
        <div><b>星座を作る</b><small>CONSTELLATION EDITOR</small></div>
        <span>テリシアの星から、光を結んでください</span>
      </div>
      <div class="constellation-editor-chart"></div>
      <div class="constellation-editor-controls">
        <div class="constellation-editor-selection"></div>
        <div class="constellation-editor-actions">
          <label><small>星座名</small><input maxlength="16" placeholder="この星座に名前をつける"></label>
          <button type="button" class="constellation-editor-complete">完成</button>
        </div>
        <div class="constellation-editor-tools">
          <button type="button" data-editor-action="undo">一つ戻す</button>
          <button type="button" data-editor-action="clear">テリシアの星まで戻す</button>
        </div>
      </div>`;

    const chart=createStarChart({
      companions,
      unlocked:unlocked.includes('tericia')?unlocked:[...unlocked,'tericia'],
      active:[],
      constellations:[],
      onToggle:()=>{},
      editor:{path,lockedId,onToggle:toggle},
    });
    overlay.querySelector('.constellation-editor-chart').appendChild(chart);

    const members=companionMembers();
    const minorCount=path.length-members.length;
    overlay.querySelector('.constellation-editor-selection').innerHTML=
      members.map(id=>`<span>${companions[id]?.name??id}${id===lockedId?' ✦':''}</span>`).join('')
      +(minorCount?`<span>小星 × ${minorCount}</span>`:'');

    const input=overlay.querySelector('input');
    input.value=name;
    input.addEventListener('input',()=>{
      name=input.value;
      overlay.querySelector('.constellation-editor-complete').disabled=
        members.length<2||!name.trim();
    });
    const complete=overlay.querySelector('.constellation-editor-complete');
    complete.disabled=members.length<2||!name.trim();
    complete.addEventListener('click',()=>{
      if(complete.disabled)return;
      const finalMembers=companionMembers();
      const connections=path.slice(1).map((id,index)=>[path[index],id]);
      overlay.classList.add('completing');
      setTimeout(()=>{
        overlay.remove();
        onComplete?.({name:name.trim(),members:finalMembers,path:[...path],connections});
      },900);
    });
    overlay.querySelector('[data-editor-action="undo"]').addEventListener('click',()=>{
      if(path.length>1){path.pop();render();}
    });
    overlay.querySelector('[data-editor-action="clear"]').addEventListener('click',()=>{
      path=[`companion:${lockedId}`];render();
    });
  }

  document.body.appendChild(overlay);
  render();
  return ()=>overlay.remove();
}

export { openConstellationEditor };
