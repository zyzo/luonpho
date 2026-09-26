import './style.css';
import { createWorld, DURATION } from './world.js';
import { StreetAudio } from './audio.js';
import { createSteering } from './steering.js';

const steering = createSteering();

const $ = (id) => document.getElementById(id);
const audio = new StreetAudio();
let world;
let time = 0;
let started = false;
let paused = false;
let soundOn = false;
let previous = performance.now();
let cinema = false;
function setSoundUi(){
  $('sound-label').textContent=soundOn?'Sound on':'Sound off';
  $('sound').setAttribute('aria-label',soundOn?'Mute street sound':'Turn street sound on');
  $('sound').setAttribute('aria-pressed',String(soundOn));
  $('sound-waves').setAttribute('d',soundOn?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 6 6m0-6-6 6');
}
async function enableSound(){
  try {const result=await audio.start();if(result===false)throw new Error('Audio unavailable');audio.setMuted(false);audio.setVolume(Number($('volume').value));audio.setPaused(paused||document.hidden);soundOn=true;}
  catch(error){console.warn('Street audio could not start:',error);soundOn=false;}
  setSoundUi();
}
async function start(){time=0;started=true;document.body.classList.add('riding');$('intro').inert=true;$('intro').setAttribute('aria-hidden','true');$('play').focus({preventScroll:true});await enableSound();}
function setPaused(value){paused=value;$('play').textContent=paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',paused?'Resume ride':'Pause ride');audio.setPaused(paused||document.hidden);}
async function toggleSound(){if(soundOn){soundOn=false;audio.setMuted(true);setSoundUi();}else await enableSound();}
function toggleCinema(){cinema=!cinema;document.body.classList.toggle('cinema',cinema);$('cinema').setAttribute('aria-pressed',String(cinema));}
$('start').addEventListener('click',start);
$('play').addEventListener('click',()=>setPaused(!paused));
$('sound').addEventListener('click',toggleSound);
$('volume').addEventListener('input',()=>audio.setVolume(Number($('volume').value)));
$('cinema').addEventListener('click',toggleCinema);
addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target.isContentEditable)return;if(event.code==='ArrowLeft'||event.code==='ArrowRight'){event.preventDefault();steering.press(event.code);return;}if(event.code==='Space'){event.preventDefault();setPaused(!paused);}if(event.key.toLowerCase()==='m')toggleSound();if(event.key.toLowerCase()==='h'||(event.key==='Escape'&&cinema))toggleCinema();});
addEventListener('keyup',event=>steering.release(event.code));
addEventListener('blur',()=>steering.clear());
addEventListener('pointermove',event=>{if(!world)return;world.pointer.x=(event.clientX/innerWidth-.5)*2;world.pointer.y=-(event.clientY/innerHeight-.5)*2;});
addEventListener('pointerout',event=>{if(!event.relatedTarget&&world){world.pointer.x=0;world.pointer.y=0;}});
addEventListener('resize',()=>world?.resize());
document.addEventListener('visibilitychange',()=>{previous=performance.now();steering.clear();audio.setPaused(document.hidden||paused);});
try {
  world=createWorld($('scene'));
  world.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();setPaused(true);$('error').hidden=false;$('error').textContent='The graphics connection was interrupted. Reload to hop back on.';});
  function frame(now){const dt=Math.min((now-previous)/1000,.1);previous=now;if(!document.hidden){if(!paused){time=(time+dt)%DURATION;steering.update(dt);}world.render(time,started,dt,steering);if(soundOn)audio.update(time,1,.88+.12*Math.sin(time/DURATION*Math.PI*12));}requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  // Read-only scene diagnostics and deterministic seeking support visual verification.
  if(import.meta.env.DEV)window.__ride={get time(){return time;},get paused(){return paused;},get soundOn(){return soundOn;},getStats:world.getStats,get steering(){return {x:steering.x,lean:steering.lean};},seek(value){time=((value%DURATION)+DURATION)%DURATION;world.render(time,started,1,steering);},setPaused,renderAt(value){world.render(value,started,1,steering);},audio};
} catch(error){console.error(error);$('error').hidden=false;$('error').textContent='This ride needs a browser with WebGL enabled. Please enable hardware acceleration and reload.';}
addEventListener('pagehide',()=>audio.dispose(),{once:true});
