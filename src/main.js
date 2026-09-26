import './style.css';
import { createWorld, DURATION } from './world.js';
import { StreetAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const audio = new StreetAudio();
let world;
let time = 0;
let started = false;
let paused = false;
let soundOn = false;
let previous = performance.now();
let cinema = false;
let lastUiSecond = -1;
const notes = [
  'Coffee brewing. Engines humming. Life happening.',
  'A horn, a hello, and another cà phê sữa đá.',
  'The sidewalk belongs to everybody. And the dogs.',
  'Somewhere between a phở shop and a very good day.',
  'One more scooter. There is always room.',
  'No destination. Just the long way home.'
];
function setSoundUi(){
  $('sound-label').textContent=soundOn?'Sound on':'Sound off';
  $('sound').setAttribute('aria-label',soundOn?'Mute street sound':'Turn street sound on');
  $('sound').setAttribute('aria-pressed',String(soundOn));
  $('sound-waves').setAttribute('d',soundOn?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 6 6m0-6-6 6');
}
async function enableSound(){
  try {const result=await audio.start();if(result===false)throw new Error('Audio unavailable');audio.setMuted(false);audio.setVolume(Number($('volume').value));audio.setPaused(paused||document.hidden);soundOn=true;}
  catch(error){console.warn('Street audio could not start:',error);soundOn=false;$('street-note').textContent='Your browser could not start audio. The ride is still ready.';}
  setSoundUi();
}
async function start(){time=0;started=true;document.body.classList.add('riding');$('intro').inert=true;$('intro').setAttribute('aria-hidden','true');$('play').focus({preventScroll:true});await enableSound();}
function setPaused(value){paused=value;$('play').textContent=paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',paused?'Resume ride':'Pause ride');audio.setPaused(paused||document.hidden);}
async function toggleSound(){if(soundOn){soundOn=false;audio.setMuted(true);setSoundUi();}else await enableSound();}
function toggleCinema(){cinema=!cinema;document.body.classList.toggle('cinema',cinema);$('cinema').setAttribute('aria-pressed',String(cinema));}
function updateUi(){const second=Math.floor(time);$('elapsed').textContent=`${String(Math.floor(second/60)).padStart(2,'0')}:${String(second%60).padStart(2,'0')}`;$('progress').value=time;$('progress').style.setProperty('--progress',`${time/DURATION*100}%`);if(second!==lastUiSecond){$('street-note').textContent=notes[Math.floor(time/30)%notes.length];lastUiSecond=second;}}
$('start').addEventListener('click',start);
$('play').addEventListener('click',()=>setPaused(!paused));
$('sound').addEventListener('click',toggleSound);
$('volume').addEventListener('input',()=>audio.setVolume(Number($('volume').value)));
$('cinema').addEventListener('click',toggleCinema);
$('progress').addEventListener('input',()=>{time=Number($('progress').value)%DURATION;audio.update(time,1,1);updateUi();});
$('about-toggle').addEventListener('click',()=>$('about').showModal());
$('about-close').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',event=>{if(event.target===$('about')){const bounds=$('about').getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)$('about').close();}});
addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement||$('about').open)return;if(event.code==='Space'){event.preventDefault();setPaused(!paused);}if(event.key.toLowerCase()==='m')toggleSound();if(event.key.toLowerCase()==='h'||(event.key==='Escape'&&cinema))toggleCinema();});
addEventListener('pointermove',event=>{if(!world)return;world.pointer.x=(event.clientX/innerWidth-.5)*2;world.pointer.y=-(event.clientY/innerHeight-.5)*2;});
addEventListener('pointerout',event=>{if(!event.relatedTarget&&world){world.pointer.x=0;world.pointer.y=0;}});
addEventListener('resize',()=>world?.resize());
document.addEventListener('visibilitychange',()=>{previous=performance.now();audio.setPaused(document.hidden||paused);});
try {
  world=createWorld($('scene'));
  world.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();setPaused(true);$('error').hidden=false;$('error').textContent='The graphics connection was interrupted. Reload to hop back on.';});
  function frame(now){const dt=Math.min((now-previous)/1000,.1);previous=now;if(!document.hidden){if(!paused)time=(time+dt)%DURATION;world.render(time,started,dt);if(soundOn)audio.update(time,1,.88+.12*Math.sin(time/DURATION*Math.PI*12));updateUi();}requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  // Read-only scene diagnostics and deterministic seeking support visual verification.
  if(import.meta.env.DEV)window.__ride={get time(){return time;},get paused(){return paused;},get soundOn(){return soundOn;},getStats:world.getStats,seek(value){time=((value%DURATION)+DURATION)%DURATION;world.render(time,started,1);updateUi();},setPaused,renderAt(value){world.render(value,started,1);},audio};
} catch(error){console.error(error);$('error').hidden=false;$('error').textContent='This ride needs a browser with WebGL enabled. Please enable hardware acceleration and reload.';}
addEventListener('pagehide',()=>audio.dispose(),{once:true});
