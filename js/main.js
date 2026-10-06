/**
 * Page controller.
 *
 * Wires the seed input and buttons, then runs `compose(seed)` task by task.
 * Each task is either a sync draw function or an async step (watercolour bands).
 * Starting a new render cancels any in-flight one.
 */
import { cv } from './canvas.js';
import { compose } from './chart.js';

let job = 0;

async function run(seed) {
  const myJob = ++job;
  const status = document.getElementById('status');
  const image = document.getElementById('art');
  const loading = document.getElementById('art-loading');

  const say = text => {
    if (myJob === job) loading.textContent = text;
  };

  image.hidden = true;
  loading.hidden = false;
  status.textContent = '';
  say('Painting…');

  // Yield once so the loading state paints before heavy work begins.
  await new Promise(resolve => setTimeout(resolve, 30));

  try {
    const tasks = compose(seed);

    for (let i = 0; i < tasks.length; i++) {
      if (myJob !== job) return;

      if (tasks[i].wait) await tasks[i].wait(say);
      else tasks[i].f();

      // Yield every few sync tasks so the status line can update.
      if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (myJob !== job) return;

    image.src = cv.toDataURL('image/png');
    loading.hidden = true;
    image.hidden = false;
    status.textContent = `Seed ${seed}. Right-click or long-press the image to save it.`;
  } catch (err) {
    const needsWebGL = /WebGL2/.test(err.message);
    const msg = 'Rendering failed: ' + err.message + (needsWebGL ? ' This version needs a browser with WebGL2.' : '');
    say(msg);
    status.textContent = msg;
    console.error(err);
  }
}

const seedInput = document.getElementById('seed');
seedInput.value = Math.floor(Math.random() * 100000);

document.getElementById('go').addEventListener('click', () => {
  seedInput.value = Math.floor(Math.random() * 100000);
  run(+seedInput.value);
});

document.getElementById('again').addEventListener('click', () => run(+seedInput.value || 1));
seedInput.addEventListener('change', () => run(+seedInput.value || 1));

(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => run(+seedInput.value));
