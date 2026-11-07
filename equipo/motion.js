/* Presentation effects only: no requests, storage, sound or application data. */
(() => {
  'use strict';
  const root = document.documentElement;
  const stage = document.querySelector('.hero-visual');
  if (!stage || root.dataset.teamMotionInitialized === 'true') return;
  root.dataset.teamMotionInitialized = 'true';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = false;
  let observer;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'motion-toggle';
  button.setAttribute('aria-pressed', 'false');
  (document.querySelector('.hero-copy') || stage).append(button);

  // The two projected circles keep a constant speed; the card stays readable.
  document.querySelectorAll('.hero-visual .orbit').forEach(orbit => {
    if (!orbit.querySelector('i')) orbit.append(document.createElement('i'));
  });
  const line = stage.querySelector('.connection-line path');
  if (line && !stage.querySelector('.connection-travel')) {
    const light = line.cloneNode(false);
    light.removeAttribute('id');
    light.setAttribute('class', 'connection-travel');
    light.setAttribute('pathLength', '1000');
    light.setAttribute('aria-hidden', 'true');
    line.parentNode.append(light);
  }

  function updateMotion() {
    const reduced = preference.matches;
    root.dataset.teamMotion = reduced ? 'reduced' : 'ready';
    root.dataset.teamMotionPaused = String(userPaused || reduced || document.hidden);
    button.hidden = reduced;
    button.setAttribute('aria-pressed', String(userPaused));
    button.textContent = userPaused ? 'Reanudar animación' : 'Pausar animación';
  }

  button.addEventListener('click', () => {
    userPaused = !userPaused;
    updateMotion();
  });
  document.addEventListener('visibilitychange', updateMotion);
  if (typeof preference.addEventListener === 'function') {
    preference.addEventListener('change', updateMotion);
  } else if (typeof preference.addListener === 'function') {
    preference.addListener(updateMotion);
  }

  // All content is visible before JavaScript and before observation. Reveals
  // add a short entrance, rather than hiding content behind an observer.
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (!preference.matches) entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -24px 0px' });
    document.querySelectorAll('.tools .section-heading,.tool,.access-card,.project .section-heading,.repository-card,.project-links>a,.closing').forEach(node => {
      node.classList.add('motion-reveal');
      observer.observe(node);
    });
  }
  updateMotion();
})();
