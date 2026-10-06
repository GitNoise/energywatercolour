// The page: buttons, seeds, and running a render task by task.
import { cv } from './canvas.js';
import { compose } from './chart.js';

let job = 0;
async function run(seed){
  const my = ++job, st = document.getElementById('status'), img = document.getElementById('art'), loading = document.getElementById('art-loading');
  const say = t => { if (my === job) loading.textContent = t; };
  img.hidden = true;
  loading.hidden = false;
  st.textContent = '';
  say('Painting…');
  await new Promise(r => setTimeout(r, 30));
  try {
    const tasks = compose(seed);
    for (let i = 0; i < tasks.length; i++){
      if (my !== job) return;
      if (tasks[i].wait) await tasks[i].wait(say); else tasks[i].f();
      if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
    }
    if (my !== job) return;
    img.src = cv.toDataURL('image/png');
    loading.hidden = true;
    img.hidden = false;
    st.textContent = `Seed ${seed}. Right-click or long-press the image to save it.`;
  } catch (err){
    const msg = 'Rendering failed: ' + err.message + (/WebGL2/.test(err.message) ? ' This version needs a browser with WebGL2.' : '');
    say(msg);
    st.textContent = msg;
    console.error(err);
  }
}
const seedEl = document.getElementById('seed');
seedEl.value = Math.floor(Math.random() * 100000);
document.getElementById('go').addEventListener('click', () => { seedEl.value = Math.floor(Math.random() * 100000); run(+seedEl.value); });
document.getElementById('again').addEventListener('click', () => run(+seedEl.value || 1));
seedEl.addEventListener('change', () => run(+seedEl.value || 1));
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => run(+seedEl.value));
