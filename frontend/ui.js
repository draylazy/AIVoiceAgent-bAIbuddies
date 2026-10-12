/* =========================================================
   ui.js — presentation-only layer for the cinematic hero.
   Does NOT touch app/AI/voice logic: it only drives existing
   controls (#chat-input, #btn-send, #btn-mic, #btn-open-plan)
   the same way a user would.
   ========================================================= */
(function () {
    const body = document.body;
    const isMeal = () => body.classList.contains('mealbuddy-page');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---------- Typewriter (speed 38ms/char, 600ms start delay) ---------- */
    const TYPE_TEXT = {
        fitness: "Glad you stopped in. Strong habits tend to find us. Now, what are we training today?",
        nutrition: "Glad you stopped in. Good food tends to find us. Now, what are we eating today?"
    };
    const twEl = document.getElementById('typewriter');
    const twText = document.getElementById('typewriter-text');
    let twTimer = null, twDelay = null;

    function typewriter(text, speed = 38, startDelay = 600) {
        clearTimeout(twDelay);
        clearInterval(twTimer);
        twText.textContent = '';
        twEl.classList.remove('done');
        twEl.setAttribute('aria-label', text);

        if (reducedMotion.matches) {
            twText.textContent = text;
            twEl.classList.add('done');
            return;
        }

        let i = 0;
        twDelay = setTimeout(() => {
            twTimer = setInterval(() => {
                i++;
                twText.textContent = text.slice(0, i);
                if (i >= text.length) {
                    clearInterval(twTimer);
                    twEl.classList.add('done');
                }
            }, speed);
        }, startDelay);
    }

    let lastMode = isMeal() ? 'nutrition' : 'fitness';
    typewriter(TYPE_TEXT[lastMode]);

    // Re-type when app.js switches between Workout / Nutrition
    new MutationObserver(() => {
        const mode = isMeal() ? 'nutrition' : 'fitness';
        if (mode !== lastMode) {
            lastMode = mode;
            typewriter(TYPE_TEXT[mode], 38, 250);
            document.querySelector('meta[name="theme-color"]')
                ?.setAttribute('content', mode === 'nutrition' ? '#a8480c' : '#8e1022');
        }
    }).observe(body, { attributes: true, attributeFilter: ['class'] });

    /* ---------- Pill buttons (fade/slide in at 400ms, independent of typing) ---------- */
    const pillRow = document.getElementById('pill-row');
    setTimeout(() => pillRow.classList.add('is-visible'), 400);

    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');
    const btnMic = document.getElementById('btn-mic');

    if (pillRow) {
        pillRow.querySelectorAll('.pill[data-prompt]').forEach(pill => {
            pill.addEventListener('click', () => {
                if (chatInput.disabled || btnSend.classList.contains('btn-stop')) return;
                chatInput.value = pill.dataset.prompt;
                document.querySelector('.dashboard-grid')?.classList.add('has-conversation');
                btnSend.click();
            });
        });
    }

    document.getElementById('pill-talk')?.addEventListener('click', () => btnMic?.click());

    /* ---------- Mouse-driven character motion (scrub-style, SENSITIVITY 0.8) ---------- */
    const parallax = document.getElementById('hero-parallax');
    const SENSITIVITY = 0.8;
    const MAX_SHIFT = 22;   // px
    let prevX = null, target = 0, current = 0, rafId = null;

    function tick() {
        if (!parallax) return;
        current += (target - current) * 0.08;
        parallax.style.transform =
            `translate3d(${(-current * MAX_SHIFT).toFixed(2)}px, 0, 0) ` +
            `rotate(${(current * 0.35).toFixed(3)}deg) scale(1.03)`;
        rafId = Math.abs(target - current) > 0.0005 ? requestAnimationFrame(tick) : null;
    }

    if (parallax) {
        window.addEventListener('mousemove', e => {
            if (reducedMotion.matches) return;
            if (prevX === null) { prevX = e.clientX; return; }
            const delta = e.clientX - prevX;
            prevX = e.clientX;
            target = Math.max(-1, Math.min(1, target + (delta / window.innerWidth) * SENSITIVITY * 2));
            if (!rafId) rafId = requestAnimationFrame(tick);
        }, { passive: true });
    }

    /* ---------- Poke the character ---------- */
    const heroStage = document.getElementById('hero-stage') || document.getElementById('stage');
    const heroAnim = document.getElementById('hero-anim');
    if (heroStage && heroAnim) {
        heroStage.addEventListener('click', () => {
            heroAnim.classList.remove('poke');
            void heroAnim.offsetWidth; // restart animation
            heroAnim.classList.add('poke');
            const coachArea = document.getElementById('coach-area');
            if (window.bullAvatar && coachArea.classList.contains('state-idle')) {
                window.bullAvatar.react('random');
            }
        });
        heroAnim.addEventListener('animationend', e => {
            if (e.animationName === 'heroPoke') heroAnim.classList.remove('poke');
        });
    }

    /* ---------- Mobile hamburger menu ---------- */
    const burger = document.getElementById('nav-burger');
    const menu = document.getElementById('mobile-menu');

    function setMenu(open) {
        if (!burger || !menu) return;
        burger.classList.toggle('open', open);
        menu.classList.toggle('open', open);
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    burger?.addEventListener('click', () => setMenu(!menu?.classList.contains('open')));
    menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.getElementById('mobile-menu-plan')?.addEventListener('click', () => {
        setMenu(false);
        document.getElementById('btn-open-plan')?.click();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 768px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

    /* ---------- Keep desktop + mobile nav "active" state in sync ---------- */
    window.addEventListener('DOMContentLoaded', () => {
        const links = document.querySelectorAll('.nav-bar a, .mobile-only-switch a');
        links.forEach(link => link.addEventListener('click', () => {
            const href = link.getAttribute('href');
            links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === href));
        }));
    });
})();
