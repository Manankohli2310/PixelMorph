const texts = ["Transform. Compress. Convert.", "Published by Manan Kohli."];
let index = 0;
let charIndex = 0;
let isDeleting = false;
const speed = 100; // Typing speed in ms
const delay = 2000; // Delay before switching text
const blankDelay = 500; // Delay to show blank space when deleting

function typeEffect() {
  let currentText = texts[index];
  let displayText = currentText.substring(0, charIndex);
  document.getElementById("typewriter").textContent = displayText;

  if (isDeleting) {
    if (charIndex > 0) {
      charIndex--;
      setTimeout(typeEffect, speed / 2); // Faster deletion
    } else {
      document.getElementById("typewriter").textContent = ""; // Show blank space
      setTimeout(() => {
        isDeleting = false;
        index = (index + 1) % texts.length;
        setTimeout(typeEffect, speed);
      }, blankDelay);
    }
  } else {
    if (charIndex <= currentText.length) {
      charIndex++;
      setTimeout(typeEffect, speed);
    } else {
      isDeleting = true;
      setTimeout(typeEffect, delay);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  typeEffect();

  // Smooth scroll effect for the button
  const scrollButton = document.querySelector("a[href='#hr']");
  if (scrollButton) {
    scrollButton.addEventListener("click", function (event) {
      event.preventDefault(); // Prevent default anchor behavior

      const targetElement = document.querySelector("#hr");
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
});



/* Pixel Morph – background picker + cursor light
   Load after script.js:  <script src="background.js"></script> */
(() => {
  const outer = document.querySelector('.blob-outer-container');
  const hero = document.querySelector('.home-page');
  const picker = document.querySelector('.bg-picker');
  if (!outer || !hero) return;

  const STORAGE_KEY = 'pixelmorph-bg';
  const PATTERNS = ['smooth', 'ripple'];

  /* ----- choose + remember the background ----- */
  function setPattern(name) {
    if (!PATTERNS.includes(name)) name = 'smooth';
    outer.dataset.pattern = name;
    if (picker) {
      picker.querySelectorAll('button').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.pattern === name)));
    }
    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
  }

  let saved = 'smooth';
  try { saved = localStorage.getItem(STORAGE_KEY) || 'smooth'; } catch (e) {}
  setPattern(saved);

  if (picker) {
    picker.addEventListener('click', e => {
      const btn = e.target.closest('button[data-pattern]');
      if (btn) setPattern(btn.dataset.pattern);
    });
  }

  /* ----- pause animation when hero is offscreen ----- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      outer.classList.toggle('is-paused', !entry.isIntersecting);
    }).observe(hero);
  }

  /* ----- cursor-follow light (also centres the ripple pattern) ----- */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const r0 = outer.getBoundingClientRect();
  let tx = r0.width / 2, ty = r0.height * 0.4;
  let x = tx, y = ty, running = false;
  outer.style.setProperty('--mx', x);
  outer.style.setProperty('--my', y);

  hero.addEventListener('pointermove', e => {
    const r = outer.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
    if (!running) { running = true; requestAnimationFrame(tick); }
  });

  function tick() {
    x += (tx - x) * 0.07;
    y += (ty - y) * 0.07;
    outer.style.setProperty('--mx', x.toFixed(1));
    outer.style.setProperty('--my', y.toFixed(1));
    if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) requestAnimationFrame(tick);
    else running = false;
  }
})();


/* Version toggle: slide, then switch page */
document.querySelectorAll('.ver-toggle a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    if (a.getAttribute('aria-current') === 'page') return;
    a.parentElement.dataset.active = a.dataset.ver;
    setTimeout(() => { location.href = a.getAttribute('href'); }, 280);
  });
});