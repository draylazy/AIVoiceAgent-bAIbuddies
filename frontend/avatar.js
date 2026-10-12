const stage = document.querySelector('#stage');
const status = document.querySelector('#coach-status') || document.querySelector('#status');

import { createRhino } from './rhino.js';
try {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(33, 1, .1, 100);
    camera.position.set(0, 2.55, 8.7); camera.lookAt(0, 2.13, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3; stage.prepend(renderer.domElement);
    const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('role', 'button'); canvas.setAttribute('aria-label', '3D bull coach.');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x747e62, 2.5));
    const key = new THREE.DirectionalLight(0xffe8cd, 4); key.position.set(-3, 7, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 6; key.shadow.camera.bottom = -3; key.shadow.normalBias = .03; scene.add(key);
    const rim = new THREE.DirectionalLight(0xe5f2ff, 3); rim.position.set(4, 4, -3); scene.add(rim);
    const mat = (c, r = .6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const fur = mat('#704237'), muzzle = mat('#a37157'), dark = mat('#2a2420'), shirt = mat('#394743'), trim = mat('#26332e'), horn = mat('#d7c3a0'), white = mat('#fff7e7', .3), iris = mat('#8e582d', .3), black = mat('#151311', .2), inner = mat('#b57e6b');
    const sphere = new THREE.SphereGeometry(1, 32, 24);
    function ell(parent, material, pos, scale, tag = 'body') { const m = new THREE.Mesh(sphere, material); m.position.set(...pos); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; m.userData.part = tag; parent.add(m); return m; }

    const bull = new THREE.Group(); scene.add(bull);
    const torso = new THREE.Group(); bull.add(torso);
    ell(torso, shirt, [0, 1.95, 0], [.87, .92, .48]);
    for (const s of [-1, 1]) { ell(torso, shirt, [s * .38, 2.25, .2], [.5, .46, .36]); ell(bull, trim, [s * .38, .77, 0], [.4, .62, .38]); ell(bull, dark, [s * .39, .22, .13], [.32, .22, .43]); for (const q of [-1, 1]) ell(bull, muzzle, [s * .39 + q * .115, .2, .43], [.105, .14, .14]); }
    ell(bull, trim, [0, 1.24, 0], [.72, .35, .4]);
    ell(torso, horn, [0, 2.39, .465], [.11, .11, .025]);
    const head = new THREE.Group(); head.position.set(0, 3.13, .05); torso.add(head);
    ell(head, fur, [0, 0, 0], [.64, .69, .5], 'head'); ell(head, fur, [0, .33, -.03], [.59, .39, .44], 'head');
    ell(head, muzzle, [0, -.3, .43], [.53, .3, .34], 'head');

    for (const s of [-1, 1]) {
        const ear = ell(head, fur, [s * .72, .12, -.04], [.35, .16, .16], 'head'); ear.rotation.z = s * .18;
        const e = ell(head, inner, [s * .75, .14, .08], [.24, .085, .035], 'head'); e.rotation.z = s * .18;
        ell(head, white, [s * .29, .1, .435], [.205, .24, .12], 'head'); ell(head, iris, [s * .28, .085, .537], [.115, .145, .045], 'head'); ell(head, black, [s * .28, .09, .573], [.06, .09, .025], 'head'); ell(head, white, [s * .28 - .035, .14, .598], [.027, .035, .012], 'head');
        const brow = ell(head, fur, [s * .28, .3, .47], [.26, .105, .1], 'head'); brow.rotation.z = s * .22;
        const nostril = ell(head, dark, [s * .24, -.24, .72], [.084, .06, .025], 'head'); nostril.rotation.z = s * .5;
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * .46, .43, -.09), new THREE.Vector3(s * .78, .48, -.08), new THREE.Vector3(s * .94, .7, -.08), new THREE.Vector3(s * .91, .99, -.06)]);
        const n = 32, rings = 12, frames = curve.computeFrenetFrames(n, false), verts = [], indices = [];
        for (let i = 0; i <= n; i++) { const p = curve.getPointAt(i / n), r = .17 * Math.pow(1 - i / n, .72) + .003; for (let j = 0; j < rings; j++) { const a = j / rings * Math.PI * 2, v = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r); verts.push(v.x, v.y, v.z); } }
        for (let i = 0; i < n; i++) for (let j = 0; j < rings; j++) { const a = i * rings + j, b = i * rings + (j + 1) % rings, c = a + rings, d = b + rings; indices.push(a, b, c, b, d, c); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(indices); g.computeVertexNormals(); const h = new THREE.Mesh(g, horn); h.castShadow = true; h.userData.part = 'head'; head.add(h);
    }

    const mouthGroup = new THREE.Group(); head.add(mouthGroup);
    const mouthOpening = ell(mouthGroup, dark, [0, -.445, .747], [.275, .108, .038], 'head');
    const teeth = ell(mouthGroup, white, [0, -.405, .773], [.208, .028, .018], 'head');
    const mouthInner = ell(mouthGroup, inner, [0, -.495, .767], [.145, .023, .014], 'head');
    const lipCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.275, -.448, .752), new THREE.Vector3(-.18, -.535, .751),
        new THREE.Vector3(0, -.554, .75), new THREE.Vector3(.18, -.535, .751),
        new THREE.Vector3(.275, -.448, .752)
    ]);
    const lip = new THREE.Mesh(new THREE.TubeGeometry(lipCurve, 32, .021, 8, false), muzzle);
    lip.userData.part = 'head'; mouthGroup.add(lip);
    const mouthOriginalY = mouthGroup.position.y;
    const mouthOpeningOriginalScaleY = mouthOpening.scale.y;

    const arms = [], elbows = [], dumbbells = [];
    const metal = mat('#adb7bc', .25); metal.metalness = .8;
    const rubber = mat('#202b2c', .55);
    function dumbbell(parent, s) {
        const group = new THREE.Group(); group.position.set(-s * .08, .73, .04); parent.add(group);
        function cylinder(radius, length, x, material) {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), material);
            mesh.rotation.z = Math.PI / 2; mesh.position.x = x; mesh.castShadow = true; mesh.userData.part = 'arm'; group.add(mesh);
        }
        cylinder(.055, .98, 0, metal);
        for (const side of [-1, 1]) { cylinder(.25, .18, side * .36, rubber); cylinder(.20, .07, side * .475, metal); }
        group.visible = false; dumbbells.push(group);
    }
    for (const s of [-1, 1]) {
        const shoulder = new THREE.Group(); shoulder.position.set(s * .77, 2.48, 0); torso.add(shoulder); arms.push(shoulder);
        ell(shoulder, shirt, [s * .12, -.08, 0], [.31, .39, .34], 'arm');
        const upper = ell(shoulder, fur, [s * .4, -.23, .02], [.3, .44, .3], 'arm'); upper.rotation.z = -s * .55;
        const elbow = new THREE.Group(); elbow.position.set(s * .62, -.25, .05); shoulder.add(elbow); elbows.push(elbow);
        const forearm = ell(elbow, fur, [0, .35, 0], [.25, .43, .25], 'arm'); forearm.rotation.z = s * .2;
        ell(elbow, fur, [-s * .08, .73, .04], [.29, .25, .26], 'arm');
        for (let j = 0; j < 3; j++) ell(elbow, muzzle, [-s * .08 + (j - 1) * .13, .79, .23], [.075, .105, .07], 'arm');
        dumbbell(elbow, s);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: .13 })); floor.rotation.x = -Math.PI / 2; floor.position.y = .005; floor.receiveShadow = true; scene.add(floor);

    const ideaBulb = new THREE.Group(); ideaBulb.position.set(0, 4.25, .12); ideaBulb.visible = false; bull.add(ideaBulb);
    const bulbGlass = new THREE.MeshStandardMaterial({ color: '#ffe68a', emissive: '#ffc329', emissiveIntensity: 1.4, roughness: .28 });
    const bulbRay = new THREE.MeshBasicMaterial({ color: '#ffc342' });
    ell(ideaBulb, bulbGlass, [0, 0, 0], [.18, .21, .16], 'idea');
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.09, .075, .13, 24), bulbGlass); neck.position.y = -.19; ideaBulb.add(neck);
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(.086, .086, .028, 24), metal);
        ring.position.y = -.25 - i * .033; ideaBulb.add(ring);
    }
    ell(ideaBulb, dark, [0, -.34, 0], [.05, .025, .05], 'idea');
    const rays = new THREE.Group(); ideaBulb.add(rays);
    for (let i = 0; i < 7; i++) {
        const angle = Math.PI * .06 + i * Math.PI * .88 / 6;
        const rayMesh = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .10, 8), bulbRay);
        rayMesh.position.set(Math.cos(angle) * .32, Math.sin(angle) * .32, .025);
        rayMesh.rotation.z = angle - Math.PI / 2; rays.add(rayMesh);
    }
    const ideaLight = new THREE.PointLight('#ffd875', .6, 1.7); ideaBulb.add(ideaLight);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let action = 'idle', started = 0; const clock = new THREE.Clock();
    const pointer = new THREE.Vector2(), ray = new THREE.Raycaster(); let lookX = 0, lookY = 0;

    const randomActions = ['workout', 'press', 'flex', 'wave', 'jump', 'think'];

    function react(type) {
        if (type === 'random') {
            const choices = currentMode === 'nutrition'
                ? ['cook', 'slice', 'think', 'celebrate']
                : randomActions;
            const validChoices = choices.filter(a => a !== action);
            type = validChoices[Math.floor(Math.random() * validChoices.length)];
        }

        if (type === 'workout' && action === 'workout') type = 'reset';
        if (type === 'press' && action === 'press') type = 'reset';
        action = type === 'reset' ? 'idle' : type;
        started = clock.getElapsedTime();

        // Let rhino handle its own reactions if it's active
        if (currentMode === 'nutrition') {
            rhino.react(action, started);
        }

        ideaBulb.visible = action === 'think';
        const working = action === 'workout' || action === 'press';
        dumbbells.forEach(d => d.visible = working);

        if (type === 'reset') { lookX = 0; lookY = 0; }

        // Let app.js know if we just randomly started something so it resets idle timer
        if (window.onAvatarAction) {
            window.onAvatarAction(action);
        }
    }

    let talkPulse = 0;
    let talkingMode = null;
    function wordPulse(mode) {
        talkPulse = 1.0;
        talkingMode = mode;
    }

    let currentMode = document.body.classList.contains('mealbuddy-page') ? 'nutrition' : 'fitness';
    const rhino = createRhino(THREE, scene);

    function setMode(mode) {
        currentMode = mode;
        if (mode === 'nutrition') {
            bull.visible = false;
            rhino.chef.visible = true;
        } else {
            bull.visible = true;
            rhino.chef.visible = false;
        }
    }

    // Apply initial visibility based on page class
    setMode(currentMode);

    // Give rhino a chance to randomly do something when idle
    setInterval(() => {
        if (currentMode === 'nutrition' && action === 'idle' && Math.random() < 0.3) {
            const actions = ['cook', 'slice'];
            react(actions[Math.floor(Math.random() * actions.length)]);
        }
    }, 4000);

    window.bullAvatar = { react, wordPulse, setMode };

    function coordinates(e) { const r = canvas.getBoundingClientRect(); pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
    canvas.addEventListener('pointermove', e => { coordinates(e); lookX = pointer.x * .3; lookY = -pointer.y * .13; });

    canvas.addEventListener('pointerleave', () => { lookX = 0; lookY = 0; });
    let down = null; canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; }); canvas.addEventListener('pointercancel', () => down = null);
    canvas.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; } down = null; coordinates(e); ray.setFromCamera(pointer, camera); const hit = ray.intersectObject(currentMode === 'fitness' ? bull : rhino.chef, true)[0]; if (hit) react('random'); });

    const observer = new ResizeObserver(() => {
        const w = stage.clientWidth, h = stage.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

        // Zoom more by reducing the distance required to fit the model
        camera.position.z = Math.max(1.9 / halfFov, 1.5 / (camera.aspect * halfFov)) + 0.3;

        // Camera placement: desktop shifts left for side chat/plan; mobile frames avatar cleanly
        if (w > 768) {
            camera.position.x = -1.4;
            camera.position.y = 2.95;
            camera.lookAt(-1.4, 2.53, 0);
        } else {
            camera.position.x = 0;
            camera.position.y = 2.62;
            camera.lookAt(0, 2.32, 0);
        }

        camera.updateProjectionMatrix();
    });
    observer.observe(stage);

    renderer.setAnimationLoop(() => {
        const t = clock.getElapsedTime(), elapsed = t - started, motion = reduced.matches ? 0 : 1;
        talkPulse = Math.max(0, talkPulse - 0.06);

        if (currentMode === 'nutrition') {
            rhino.update(t, Math.min(clock.getDelta() || 0.016, 0.05), motion, talkPulse, talkingMode);
            // Even if rhino doesn't lip-sync, we sync head movement to mouse like the bull
            if (rhino.head) {
                rhino.head.rotation.y += (lookX * motion - rhino.head.rotation.y) * .09;
                rhino.head.rotation.x += (lookY * motion - rhino.head.rotation.x) * .09;
            }
            renderer.render(scene, camera);
            return;
        }

        const duration = action === 'think' ? 4 : (action === 'workout' || action === 'press') ? 8.8 : 2.2;

        if (elapsed > duration && action !== 'idle' && action !== 'talk') action = 'idle';

        let envelope = 0;
        if (action === 'talk') {
            envelope = 1;
        } else if (action !== 'idle') {
            envelope = Math.sin(Math.min(elapsed / duration, 1) * Math.PI);
        }

        bull.position.y = motion * Math.sin(t * 2) * .025; bull.rotation.y = motion * Math.sin(t * .6) * .045;
        torso.scale.set(1, 1 + motion * Math.sin(t * 2) * .009, 1);
        head.rotation.y += (lookX * motion - head.rotation.y) * .09; head.rotation.x += (lookY * motion - head.rotation.x) * .09;
        arms.forEach(a => { a.rotation.z = 0; a.rotation.x = 0; a.position.y = 2.48; a.position.z = 0; });
        dumbbells.forEach(d => d.rotation.z = 0);
        elbows.forEach(e => e.rotation.set(0, 0, 0));
        head.rotation.z = 0;

        if (action === 'workout') {
            const equip = THREE.MathUtils.smoothstep(elapsed, 0, .4);
            const phase = Math.max(0, elapsed - .4) / 2.8 * Math.PI * 2;
            const curl = (1 - Math.cos(phase)) / 2;
            elbows.forEach(e => e.rotation.x = reduced.matches ? 1.1 : 2.45 - 2.1 * curl);
            dumbbells.forEach(d => d.scale.setScalar(reduced.matches ? 1 : equip));
            head.rotation.x = motion * (-.06 + curl * .06);
        }
        if (action === 'press') {
            const equip = reduced.matches ? 1 : THREE.MathUtils.smoothstep(elapsed, 0, .4);
            const phase = Math.max(0, elapsed - .4) / 2.8 * Math.PI * 2;
            const lift = reduced.matches ? .55 : (1 - Math.cos(phase)) / 2;
            arms.forEach((arm, i) => {
                const side = i === 0 ? -1 : 1;
                const angle = side * (.35 + 1.05 * lift);
                arm.rotation.z = angle;
                arm.position.y = 2.48 + .18 * lift;
                arm.position.z = .3;
                elbows[i].rotation.z = -angle;
                dumbbells[i].scale.setScalar(equip);
            });
        }
        if (action === 'think') {
            const appear = reduced.matches ? 1 : THREE.MathUtils.smoothstep(elapsed, .25, .7);
            ideaBulb.scale.setScalar(appear);
            ideaBulb.position.y = 4.25 + Math.sin(elapsed * 2.5) * .025 * motion;
            bulbGlass.emissiveIntensity = 1.4 + Math.sin(elapsed * 3) * .25 * motion;
            rays.scale.setScalar(1 + Math.sin(elapsed * 3) * .06 * motion);
            const pose = reduced.matches ? 1 : Math.min(1, elapsed / .55, (4 - elapsed) / .55);
            arms[1].rotation.z = .45 * pose;
            elbows[1].rotation.z = .9 * pose;
            elbows[1].rotation.x = .45 * pose;
            head.rotation.z = -.14 * pose;
            head.rotation.x = -.12 * pose;
            head.rotation.y = (.16 + Math.sin(elapsed * 1.6) * .04 * motion) * pose;
        }
        if (action === 'flex') arms.forEach((a, i) => { a.rotation.z = (i === 0 ? -1 : 1) * envelope * .25 * motion; a.rotation.x = -envelope * .25 * motion; });
        if (action === 'wave') { arms[1].rotation.z = envelope * (.22 + Math.sin(elapsed * 15) * .2) * motion; arms[1].rotation.x = -envelope * .45 * motion; head.rotation.z = -envelope * .1 * motion; }
        if (action === 'jump') bull.position.y += Math.abs(Math.sin(elapsed * Math.PI * 2)) * envelope * .4 * motion;
        if (action === 'nod') head.rotation.x += Math.sin(elapsed * 10) * envelope * .04 * motion;

        const isSpeaking = (action === 'talk' && talkPulse > 0.02 && talkingMode === 'fitness');
        mouthOpening.visible = isSpeaking;
        teeth.visible = isSpeaking;
        mouthInner.visible = isSpeaking;

        if (action === 'talk') {
            arms[0].rotation.x = -0.05 + Math.sin(t * 5) * 0.05 * motion;
            arms[1].rotation.x = -0.05 + Math.cos(t * 4) * 0.05 * motion;

            if (isSpeaking) {
                mouthOpening.scale.y = mouthOpeningOriginalScaleY * (1 + talkPulse * 0.2);
                lip.position.y = -(talkPulse * 0.01);
                mouthInner.position.y = -.495 - (talkPulse * 0.005);
                teeth.position.y = -.405;
            } else {
                mouthOpening.scale.y = mouthOpeningOriginalScaleY;
                lip.position.y = 0;
                mouthInner.position.y = -.495;
                teeth.position.y = -.405;
            }
        } else {
            mouthOpening.scale.y = mouthOpeningOriginalScaleY;
            lip.position.y = 0;
            mouthInner.position.y = -.495;
            teeth.position.y = -.405;
        }

        renderer.render(scene, camera);
    });
} catch (error) {
    console.error(error);
}
