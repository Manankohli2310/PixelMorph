/* Pixel Morph – home page script
   1. Hero title letter animation + typewriter
   2. Navbar dropdowns (tap-friendly)
   3. Background cursor-lit grid, pause when off-screen
   4. Reveal-on-scroll
   5. Card cursor spotlight + tilt
   6. Version toggle
*/
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1a. hero title: split into letters for the entrance animation ---------- */
  const title = document.querySelector('.title');
  if (title && !reduceMotion) {
    const text = title.textContent.trim();
    title.setAttribute('aria-label', text);
    title.textContent = '';
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--i', i);
      s.textContent = ch === ' ' ? '\u00A0' : ch;
      title.appendChild(s);
    });
  }

  /* ---------- 1b. typewriter ---------- */
  const typeEl = document.getElementById('typewriter');
  const texts = ['Transform. Compress. Convert.', 'Published by Manan Kohli.'];
  if (typeEl) {
    if (reduceMotion) {
      typeEl.textContent = texts[0];
    } else {
      let i = 0, c = 0, deleting = false;
      const SPEED = 90, DELETE_SPEED = 45, HOLD = 2000, BLANK = 500;
      const tick = () => {
        const t = texts[i];
        typeEl.textContent = t.slice(0, c);
        if (!deleting) {
          if (c < t.length) { c++; return setTimeout(tick, SPEED); }
          deleting = true;
          return setTimeout(tick, HOLD);
        }
        if (c > 0) { c--; return setTimeout(tick, DELETE_SPEED); }
        deleting = false;
        i = (i + 1) % texts.length;
        setTimeout(tick, BLANK);
      };
      setTimeout(tick, 1100);
    }
  }

  /* ---------- 2. navbar dropdowns: tap to open on touch screens ---------- */
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const btn = item.querySelector('.nav-btn');
    if (!btn) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = item.classList.contains('open');
      navItems.forEach(n => n.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
  document.addEventListener('click', () => navItems.forEach(n => n.classList.remove('open')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') navItems.forEach(n => n.classList.remove('open'));
  });

  /* ---------- 3. background: cursor-lit grid + pause when off-screen ---------- */
  const fx = document.querySelector('.bg-fx');
  const hero = document.querySelector('.home-page');

  if (fx && hero) {
    /* pause the animation when the hero is offscreen */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        fx.classList.toggle('is-paused', !entry.isIntersecting);
      }).observe(hero);
    }

    /* the lit grid follows the cursor smoothly */
    if (!reduceMotion) {
      const r0 = fx.getBoundingClientRect();
      let tx = r0.width / 2, ty = r0.height * 0.7;
      let x = tx, y = ty, running = false;
      fx.style.setProperty('--mx', x);
      fx.style.setProperty('--my', y);

      const tick = () => {
        x += (tx - x) * 0.1;
        y += (ty - y) * 0.1;
        fx.style.setProperty('--mx', x.toFixed(1));
        fx.style.setProperty('--my', y.toFixed(1));
        if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) requestAnimationFrame(tick);
        else running = false;
      };

      hero.addEventListener('pointermove', e => {
        const r = fx.getBoundingClientRect();
        tx = e.clientX - r.left;
        ty = e.clientY - r.top;
        if (!running) { running = true; requestAnimationFrame(tick); }
      });
    }
  }

  /* ---------- 4. reveal on scroll ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- 4b. formats marquee: always wider than the screen, so it never runs out ---------- */
  const track = document.querySelector('.marquee .track');
  if (track) {
    const groups = track.querySelectorAll('.group');
    const base = [...groups[0].children].map(n => n.cloneNode(true));
    const SPEED = 55; // pixels per second

    const buildMarquee = () => {
      const fill = g => g.replaceChildren(...base.map(n => n.cloneNode(true)));
      fill(groups[0]);
      let guard = 0;
      while (groups[0].getBoundingClientRect().width < window.innerWidth && guard++ < 12) {
        base.forEach(n => groups[0].appendChild(n.cloneNode(true)));
      }
      // second group is an exact copy, so the loop is seamless
      groups[1].replaceChildren(...[...groups[0].children].map(n => n.cloneNode(true)));
      const w = groups[0].getBoundingClientRect().width;
      track.style.setProperty('--dur', (w / SPEED).toFixed(1) + 's');
    };

    buildMarquee();
    let lastW = window.innerWidth, t;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(buildMarquee, 150);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildMarquee);
  }

  /* ---------- 5. cards: cursor spotlight + gentle tilt (mouse only) ---------- */
  if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.container').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        card.style.setProperty('--rx', ((0.5 - py) * 6).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((px - 0.5) * 8).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- 6. version toggle: slide, then switch page ---------- */
  document.querySelectorAll('.ver-toggle a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      if (a.getAttribute('aria-current') === 'page') return;
      a.parentElement.dataset.active = a.dataset.ver;
      setTimeout(() => { location.href = a.getAttribute('href'); }, 280);
    });
  });
})();