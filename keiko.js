/**
 * KEI-KO 2.0 Interactive Mascot State Machine & Animator
 * Handles 45-part modular sprite swapping, 2.5D pointer parallax,
 * idle blinking/ear-twitching, 18s sleep easter egg, spam-tap escalation,
 * and 950ms Hold / SSR Volition ZL awakening.
 */
(function (global) {
    'use strict';

    const KEIKO_VERSION = '20261122_v8';
    const ASSET_BASE = './assets/frave/keiko/';

    const ALL_ASSETS = [
        'body.webp', 'ear_l.webp', 'ear_ornament.webp', 'ear_r.webp',
        'whisker_l.webp', 'whisker_r.webp', 'hand_l.webp', 'hand_r.webp',
        'wave_l.webp', 'wave_r.webp', 'tail_root.webp',
        'tail_arrow_1.webp', 'tail_arrow_2.webp', 'tail_arrow_3.webp', 'tail_ornament.webp',
        'eye_l_open.webp', 'eye_r_open.webp', 'eye_l_closed.webp', 'eye_r_closed.webp',
        'eye_l_cute.webp', 'eye_r_cute.webp', 'eye_l_squeeze.webp', 'eye_r_squeeze.webp',
        'eye_l_sad.webp', 'eye_r_sad.webp', 'eye_l_angry.webp', 'eye_r_angry.webp',
        'eye_l_blank.webp', 'eye_r_blank.webp', 'eye_l_zl.webp', 'eye_r_zl.webp',
        'mouth_smile.webp', 'mouth_open.webp', 'mouth_sad.webp', 'mouth_pout.webp',
        'tear_open.webp', 'tear_closed.webp',
        'emote_question.webp', 'emote_exclaim.webp', 'emote_note.webp',
        'emote_heart.webp', 'emote_sparkle.webp', 'emote_z.webp',
        'emote_gloom.webp', 'emote_anger.webp'
    ];

    const ACT_CLASSES = [
        'act-happy', 'act-love', 'act-pat', 'act-sparkle', 'act-surprise', 'act-curious',
        'act-wake', 'act-pout', 'act-blank', 'act-angry', 'act-zl'
    ];

    const ANIMATED_BONE_SELECTORS = [
        '.keiko-bone-body',
        '.keiko-bone-ear-l',
        '.keiko-bone-ear-r',
        '.keiko-bone-ear-ornament',
        '.keiko-bone-tail',
        '.keiko-part-tail-ornament',
        '.keiko-part-whisker-l',
        '.keiko-part-whisker-r',
        '.keiko-part-hand-l',
        '.keiko-part-hand-r',
        '.keiko-part-wave-l',
        '.keiko-part-wave-r'
    ];

    const IDLE_FACE = {
        eyeL: 'eye_l_open.webp',
        eyeR: 'eye_r_closed.webp',
        mouth: 'mouth_smile.webp',
        tear: null,
        emote: null
    };

    const JOY_STATES = [
        {
            cls: 'act-happy',
            duration: 900,
            face: { eyeL: 'eye_l_squeeze.webp', eyeR: 'eye_r_squeeze.webp', mouth: 'mouth_open.webp', tear: null, emote: 'emote_note.webp' }
        },
        {
            cls: 'act-sparkle',
            duration: 900,
            face: { eyeL: 'eye_l_open.webp', eyeR: 'eye_r_cute.webp', mouth: 'mouth_open.webp', tear: null, emote: 'emote_sparkle.webp' }
        },
        {
            cls: 'act-pout',
            duration: 1150,
            face: { eyeL: 'eye_l_sad.webp', eyeR: 'eye_r_sad.webp', mouth: 'mouth_pout.webp', tear: 'tear_closed.webp', emote: 'emote_gloom.webp' }
        },
        {
            cls: 'act-surprise',
            duration: 850,
            face: { eyeL: 'eye_l_open.webp', eyeR: 'eye_r_open.webp', mouth: 'mouth_open.webp', tear: null, emote: 'emote_exclaim.webp' }
        },
        {
            cls: 'act-curious',
            duration: 900,
            face: { eyeL: 'eye_l_open.webp', eyeR: 'eye_r_open.webp', mouth: 'mouth_smile.webp', tear: null, emote: 'emote_question.webp' }
        }
    ];

    const SLEEP_DELAY_MS = 18000;
    const HOLD_CHARGE_DELAY_MS = 220;
    const HOLD_TRIGGER_MS = 950;
    const SPAM_WINDOW_MS = 3200;
    const SPAM_DECAY_MS = 2600;

    const decodePool = [];
    let isPreloaded = false;

    function resolveAssetUrl(filename) {
        const rel = `${ASSET_BASE}${filename}?v=${KEIKO_VERSION}`;
        if (typeof window === 'undefined') return rel;
        let base = window.location.origin + window.location.pathname;
        if (base.endsWith('.html')) {
            base = base.substring(0, base.lastIndexOf('/') + 1);
        } else if (!base.endsWith('/')) {
            base = base + '/';
        }
        try {
            return new URL(rel, base).href;
        } catch (_) {
            return rel;
        }
    }

    function preloadAllKeikoAssets() {
        if (isPreloaded) return;
        isPreloaded = true;
        ALL_ASSETS.forEach((name) => {
            const img = new Image();
            img.decoding = 'async';
            img.src = resolveAssetUrl(name);
            if (typeof img.decode === 'function') {
                img.decode().catch(() => {});
            }
            decodePool.push(img);
        });
    }

    function setupRig(rig) {
        if (!rig || rig.dataset.keikoBound === '1') return;
        rig.dataset.keikoBound = '1';

        preloadAllKeikoAssets();

        // Bind single-retry resilience on static mascot layers
        rig.querySelectorAll('.mascot-layer').forEach((img) => {
            img.addEventListener('error', function () {
                if (!this.dataset.retried) {
                    this.dataset.retried = '1';
                    const cleanBase = this.src.split('?')[0];
                    this.src = `${cleanBase}?retry=${Date.now()}`;
                }
            });
        });

        const slots = {
            eyeL: rig.querySelector('[data-slot="eyeL"]'),
            eyeR: rig.querySelector('[data-slot="eyeR"]'),
            mouth: rig.querySelector('[data-slot="mouth"]'),
            tear: rig.querySelector('[data-slot="tear"]'),
            emote: rig.querySelector('[data-slot="emote"]')
        };
        const patHeartsContainer = rig.querySelector('.keiko-pat-hearts');
        const animatedBones = ANIMATED_BONE_SELECTORS.map((sel) => rig.querySelector(sel)).filter(Boolean);
        const activeBlends = new Map();

        let joyIdx = 0;
        let spamCount = 0;
        let lastTapTime = 0;
        let isActing = false;
        let isSleeping = false;
        let isPatting = false;
        let actionTimer = null;
        let zlPhaseTimer = null;
        let patEndTimer = null;
        let patHeartTimer = null;
        let blinkScheduleTimer = null;
        let blinkResetTimer = null;
        let earTwitchTimer = null;
        let handWaveTimer = null;
        let sleepTimer = null;
        let spamDecayTimer = null;
        let hoverCuriosityTimer = null;
        let lastHoverCuriosityAt = 0;

        let patLastX = null;
        let patLastY = null;
        let patLastDir = 0;
        let patDistance = 0;
        let patReversals = 0;
        let patDecayTimer = null;
        let lastPatHeartAt = 0;

        let holdChargeTimer = null;
        let holdTriggerTimer = null;
        let pointerStart = null;
        let suppressNextClickUntil = 0;

        let isRigInView = true;
        let parallaxRafId = null;
        let lastPointerX = 0;
        let lastPointerY = 0;
        const prefersReducedMotion = typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;

        function resetParallax() {
            if (parallaxRafId !== null) {
                window.cancelAnimationFrame(parallaxRafId);
                parallaxRafId = null;
            }
            rig.style.setProperty('--kx', '0');
            rig.style.setProperty('--ky', '0');
        }

        function applyWindowParallax() {
            parallaxRafId = null;
            if (!isRigInView || !rig.isConnected || isSleeping) return;
            if (prefersReducedMotion && prefersReducedMotion.matches) return;
            const rect = rig.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const faceCx = rect.left + rect.width * 0.362;
            const faceCy = rect.top + rect.height * 0.60;
            const dx = lastPointerX - faceCx;
            const dy = lastPointerY - faceCy;
            const rangeX = Math.max(window.innerWidth * 0.36, 260);
            const rangeY = Math.max(window.innerHeight * 0.36, 220);
            const nx = Math.tanh(dx / rangeX);
            const ny = Math.tanh(dy / rangeY);
            rig.style.setProperty('--kx', nx.toFixed(3));
            rig.style.setProperty('--ky', ny.toFixed(3));
        }

        if (typeof window.IntersectionObserver === 'function') {
            const viewObserver = new window.IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (entry.target === rig) {
                        isRigInView = entry.isIntersecting;
                        if (!isRigInView) {
                            resetParallax();
                        }
                    }
                }
            }, { rootMargin: '140px' });
            viewObserver.observe(rig);
        }

        function swapSlotSrc(el, filename) {
            if (!el || !filename) return;
            if (el.dataset.assetFile === filename) return;
            el.dataset.assetFile = filename;
            delete el.dataset.retried;
            el.src = resolveAssetUrl(filename);
        }

        function setFace(cfg) {
            if (cfg.eyeL) swapSlotSrc(slots.eyeL, cfg.eyeL);
            if (cfg.eyeR) swapSlotSrc(slots.eyeR, cfg.eyeR);
            if (cfg.mouth) swapSlotSrc(slots.mouth, cfg.mouth);

            if (slots.tear) {
                if (cfg.tear) {
                    swapSlotSrc(slots.tear, cfg.tear);
                    slots.tear.classList.add('is-visible');
                } else {
                    slots.tear.classList.remove('is-visible');
                }
            }

            if (slots.emote) {
                if (cfg.emote) {
                    swapSlotSrc(slots.emote, cfg.emote);
                    slots.emote.classList.add('is-visible');
                } else {
                    slots.emote.classList.remove('is-visible');
                }
            }
        }

        function clearActiveTimers() {
            clearTimeout(actionTimer);
            clearTimeout(zlPhaseTimer);
            clearTimeout(patEndTimer);
            clearTimeout(patHeartTimer);
            clearTimeout(blinkResetTimer);
            clearTimeout(earTwitchTimer);
            clearTimeout(handWaveTimer);
            clearTimeout(hoverCuriosityTimer);
            actionTimer = null;
            zlPhaseTimer = null;
            patEndTimer = null;
            patHeartTimer = null;
            isPatting = false;
            blinkResetTimer = null;
            earTwitchTimer = null;
            handWaveTimer = null;
            hoverCuriosityTimer = null;
        }

        function parseTransformMatrix(el) {
            const raw = window.getComputedStyle(el).transform;
            if (!raw || raw === 'none') return new window.DOMMatrix();
            try {
                return new window.DOMMatrix(raw);
            } catch (_) {
                return new window.DOMMatrix();
            }
        }

        function isNearIdentityMatrix(m) {
            return (
                Math.abs(m.a - 1) < 0.002 &&
                Math.abs(m.b) < 0.002 &&
                Math.abs(m.c) < 0.002 &&
                Math.abs(m.d - 1) < 0.002 &&
                Math.abs(m.e) < 0.25 &&
                Math.abs(m.f) < 0.25
            );
        }

        function blendBones(mutateDomFn, durationMs = 320) {
            const canBlend =
                typeof window.DOMMatrix === 'function' &&
                typeof rig.animate === 'function' &&
                !(prefersReducedMotion && prefersReducedMotion.matches);

            if (!canBlend) {
                mutateDomFn();
                return;
            }

            // 1. Snapshot exact rendered transform (including active CSS animation + any running blend)
            const fromMap = new Map();
            for (const bone of animatedBones) {
                fromMap.set(bone, parseTransformMatrix(bone));
            }

            // 2. Cancel prior blend animations so toM reflects only the target state's CSS animation at t=0
            activeBlends.forEach((anim) => anim.cancel());
            activeBlends.clear();

            // 3. Apply state class change (caller handles reflow if restarting an animation)
            mutateDomFn();

            // 4. Compute additive delta (toM * delta === fromM at t=0) and ease smoothly to identity
            for (const bone of animatedBones) {
                const fromM = fromMap.get(bone);
                const toM = parseTransformMatrix(bone);
                let delta;
                try {
                    delta = toM.inverse().multiply(fromM);
                } catch (_) {
                    continue;
                }
                if (isNearIdentityMatrix(delta)) continue;

                const startStr = `matrix(${delta.a}, ${delta.b}, ${delta.c}, ${delta.d}, ${delta.e}, ${delta.f})`;
                try {
                    const anim = bone.animate(
                        [
                            { transform: startStr },
                            { transform: 'matrix(1, 0, 0, 1, 0, 0)' }
                        ],
                        {
                            duration: durationMs,
                            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                            composite: 'add'
                        }
                    );
                    activeBlends.set(bone, anim);
                    anim.onfinish = () => {
                        if (activeBlends.get(bone) === anim) activeBlends.delete(bone);
                    };
                    anim.oncancel = () => {
                        if (activeBlends.get(bone) === anim) activeBlends.delete(bone);
                    };
                } catch (_) {
                    // Graceful no-op if browser rejects composite: 'add'
                }
            }
        }

        function enterSleepState() {
            if (isActing || isSleeping) return;
            isSleeping = true;
            resetParallax();
            blendBones(() => {
                rig.classList.remove('ear-twitch-l', 'ear-twitch-r', 'hand-wave-r', 'is-charging');
                rig.classList.add('is-sleeping');
            }, 420);
            setFace({
                eyeL: 'eye_l_closed.webp',
                eyeR: 'eye_r_closed.webp',
                mouth: 'mouth_smile.webp',
                tear: null,
                emote: null
            });
        }

        function resetSleepTimer() {
            clearTimeout(sleepTimer);
            sleepTimer = setTimeout(enterSleepState, SLEEP_DELAY_MS);
        }

        function scheduleNextIdleMicro() {
            clearTimeout(blinkScheduleTimer);
            const wait = 3200 + Math.random() * 2800;
            blinkScheduleTimer = setTimeout(() => {
                if (!isActing && !isSleeping && !rig.classList.contains('is-charging')) {
                    const roll = Math.random();
                    if (roll < 0.54) {
                        setFace({ eyeL: 'eye_l_closed.webp', eyeR: 'eye_r_closed.webp' });
                        blinkResetTimer = setTimeout(() => {
                            if (!isActing && !isSleeping) {
                                setFace({ eyeL: IDLE_FACE.eyeL, eyeR: IDLE_FACE.eyeR });
                            }
                        }, 140);
                    } else if (roll < 0.78) {
                        const cls = Math.random() < 0.5 ? 'ear-twitch-l' : 'ear-twitch-r';
                        blendBones(() => {
                            rig.classList.remove('ear-twitch-l', 'ear-twitch-r');
                            void rig.offsetWidth;
                            rig.classList.add(cls);
                        }, 150);
                        earTwitchTimer = setTimeout(() => {
                            blendBones(() => {
                                rig.classList.remove('ear-twitch-l', 'ear-twitch-r');
                            }, 150);
                        }, 420);
                    } else {
                        blendBones(() => {
                            rig.classList.remove('hand-wave-r');
                            void rig.offsetWidth;
                            rig.classList.add('hand-wave-r');
                        }, 180);
                        handWaveTimer = setTimeout(() => {
                            blendBones(() => {
                                rig.classList.remove('hand-wave-r');
                            }, 180);
                        }, 1050);
                    }
                }
                scheduleNextIdleMicro();
            }, wait);
        }

        function returnToIdle() {
            clearTimeout(zlPhaseTimer);
            clearTimeout(patEndTimer);
            clearTimeout(patHeartTimer);
            zlPhaseTimer = null;
            patEndTimer = null;
            patHeartTimer = null;
            isActing = false;
            isPatting = false;
            blendBones(() => {
                rig.classList.remove('ear-twitch-l', 'ear-twitch-r', 'hand-wave-r', ...ACT_CLASSES, 'is-sleeping', 'is-charging');
            }, 360);
            setFace(IDLE_FACE);
            resetSleepTimer();
        }

        function triggerHitRing(isZl) {
            const normalRing = rig.querySelector('.mascot-hit-ring:not(.ring-zl)');
            const zlRing = rig.querySelector('.mascot-hit-ring.ring-zl');
            [normalRing, zlRing].forEach((r) => {
                if (r) r.classList.remove('is-bursting');
            });
            if (normalRing) {
                void normalRing.offsetWidth;
                normalRing.classList.add('is-bursting');
            }
            if (isZl && zlRing) {
                void zlRing.offsetWidth;
                zlRing.classList.add('is-bursting');
            }
        }

        function playAction(actClass, faceCfg, durationMs, options = {}) {
            clearActiveTimers();
            isSleeping = false;
            isActing = true;
            blendBones(() => {
                rig.classList.remove('is-sleeping', 'is-charging', 'ear-twitch-l', 'ear-twitch-r', 'hand-wave-r', ...ACT_CLASSES);
                void rig.offsetWidth;
                rig.classList.add(actClass);
            }, 200);
            setFace(faceCfg);
            triggerHitRing(Boolean(options.isZl));

            actionTimer = setTimeout(() => {
                returnToIdle();
            }, durationMs);
            resetSleepTimer();
        }

        function wakeUp() {
            playAction('act-wake', {
                eyeL: 'eye_l_open.webp',
                eyeR: 'eye_r_open.webp',
                mouth: 'mouth_open.webp',
                tear: null,
                emote: 'emote_exclaim.webp'
            }, 900);
        }

        function spawnPatHeart() {
            if (!patHeartsContainer || patHeartsContainer.childElementCount >= 6) return;
            const heart = document.createElement('img');
            heart.className = 'keiko-pat-heart';
            heart.src = resolveAssetUrl('emote_heart.webp');
            heart.alt = '';
            heart.decoding = 'async';
            // emote_heart.webp center sits at (64.3%, 25.8%); shift into head-top zone (24%..48%, 14%..24%)
            const ox = (-40 + Math.random() * 24).toFixed(1);
            const oy = (-11 + Math.random() * 9).toFixed(1);
            const driftPx = (Math.random() * 28 - 14).toFixed(1);
            const scale = (0.42 + Math.random() * 0.2).toFixed(2);
            const rot = (Math.random() * 24 - 12).toFixed(1);
            heart.style.setProperty('--ox', `${ox}%`);
            heart.style.setProperty('--oy', `${oy}%`);
            heart.style.setProperty('--hx', `${driftPx}px`);
            heart.style.setProperty('--hs', scale);
            heart.style.setProperty('--hr', `${rot}deg`);
            patHeartsContainer.appendChild(heart);
            const cleanup = () => {
                if (heart.parentNode) heart.parentNode.removeChild(heart);
            };
            heart.addEventListener('animationend', cleanup, { once: true });
            setTimeout(cleanup, 1150);
        }

        function resetPatTracking() {
            patLastX = null;
            patLastY = null;
            patLastDir = 0;
            patDistance = 0;
            patReversals = 0;
            clearTimeout(patDecayTimer);
            patDecayTimer = null;
        }

        function triggerHeadPat() {
            if (rig.classList.contains('act-zl') || rig.classList.contains('is-charging')) return;
            const now = Date.now();
            if (isPatting) {
                clearTimeout(patEndTimer);
                patEndTimer = setTimeout(() => {
                    returnToIdle();
                }, 780);
                resetSleepTimer();
                if (now - lastPatHeartAt >= 360) {
                    lastPatHeartAt = now;
                    spawnPatHeart();
                }
                return;
            }

            clearActiveTimers();
            isSleeping = false;
            isActing = true;
            isPatting = true;
            spamCount = 0;
            blendBones(() => {
                rig.classList.remove('is-sleeping', 'is-charging', 'ear-twitch-l', 'ear-twitch-r', 'hand-wave-r', ...ACT_CLASSES);
                void rig.offsetWidth;
                rig.classList.add('act-pat');
            }, 240);
            setFace({
                eyeL: 'eye_l_cute.webp',
                eyeR: 'eye_r_cute.webp',
                mouth: 'mouth_smile.webp',
                tear: null,
                emote: 'emote_heart.webp'
            });
            lastPatHeartAt = now;
            spawnPatHeart();
            patHeartTimer = setTimeout(() => {
                if (isPatting) spawnPatHeart();
            }, 140);
            patEndTimer = setTimeout(() => {
                returnToIdle();
            }, 950);
            resetSleepTimer();
        }

        function triggerVolitionZL() {
            // Beat 1: digital glitch startle (!) referencing Volition jacket
            playAction('act-zl', {
                eyeL: 'eye_l_open.webp',
                eyeR: 'eye_r_open.webp',
                mouth: 'mouth_open.webp',
                tear: null,
                emote: 'emote_exclaim.webp'
            }, 2600, { isZl: true });

            // Beat 2: switch to heterochromia Volition ZL eyes while levitating
            zlPhaseTimer = setTimeout(() => {
                if (!isActing || !rig.classList.contains('act-zl')) return;
                setFace({
                    eyeL: 'eye_l_zl.webp',
                    eyeR: 'eye_r_zl.webp',
                    mouth: 'mouth_open.webp',
                    tear: null,
                    emote: 'emote_exclaim.webp'
                });
            }, 280);
        }

        function handleInteractionClick() {
            const now = Date.now();
            if (now < suppressNextClickUntil) return;

            if (isSleeping) {
                spamCount = 1;
                lastTapTime = now;
                clearTimeout(spamDecayTimer);
                spamDecayTimer = setTimeout(() => { spamCount = 0; }, SPAM_DECAY_MS);
                wakeUp();
                return;
            }

            spamCount = (now - lastTapTime <= SPAM_WINDOW_MS) ? (spamCount + 1) : 1;
            lastTapTime = now;
            clearTimeout(spamDecayTimer);
            spamDecayTimer = setTimeout(() => { spamCount = 0; }, SPAM_DECAY_MS);

            if (spamCount >= 10) {
                playAction('act-angry', {
                    eyeL: 'eye_l_angry.webp',
                    eyeR: 'eye_r_angry.webp',
                    mouth: 'mouth_pout.webp',
                    tear: null,
                    emote: 'emote_anger.webp'
                }, 1400);
                return;
            }

            if (spamCount >= 7) {
                playAction('act-blank', {
                    eyeL: 'eye_l_blank.webp',
                    eyeR: 'eye_r_blank.webp',
                    mouth: 'mouth_sad.webp',
                    tear: 'tear_closed.webp',
                    emote: 'emote_gloom.webp'
                }, 1250);
                return;
            }

            // Clicks 1-6: cycle expressions smoothly (incl. 懊惱); Volition ZL is hold-exclusive
            const choice = JOY_STATES[joyIdx % JOY_STATES.length];
            joyIdx += 1;
            playAction(choice.cls, choice.face, choice.duration);
        }

        function cancelHold() {
            clearTimeout(holdChargeTimer);
            clearTimeout(holdTriggerTimer);
            holdChargeTimer = null;
            holdTriggerTimer = null;
            pointerStart = null;
            if (rig.classList.contains('is-charging')) {
                blendBones(() => {
                    rig.classList.remove('is-charging');
                }, 260);
                if (!isActing && !isSleeping) {
                    setFace(IDLE_FACE);
                }
            }
        }

        rig.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            resetPatTracking();
            pointerStart = { x: e.clientX, y: e.clientY };

            clearTimeout(holdChargeTimer);
            clearTimeout(holdTriggerTimer);

            holdChargeTimer = setTimeout(() => {
                if (!pointerStart) return;
                if (isSleeping) {
                    isSleeping = false;
                }
                blendBones(() => {
                    rig.classList.remove('is-sleeping', 'ear-twitch-l', 'ear-twitch-r', 'hand-wave-r');
                    rig.classList.add('is-charging');
                }, 180);
                setFace({
                    eyeL: 'eye_l_angry.webp',
                    eyeR: 'eye_r_angry.webp',
                    mouth: 'mouth_smile.webp',
                    tear: null,
                    emote: null
                });
            }, HOLD_CHARGE_DELAY_MS);

            holdTriggerTimer = setTimeout(() => {
                pointerStart = null;
                holdChargeTimer = null;
                holdTriggerTimer = null;
                suppressNextClickUntil = Date.now() + 550;
                spamCount = 0;
                triggerVolitionZL();
            }, HOLD_TRIGGER_MS);
        });

        rig.addEventListener('pointermove', (e) => {
            if (pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 10) {
                cancelHold();
            }

            const rect = rig.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const relX = (e.clientX - rect.left) / rect.width;
            const relY = (e.clientY - rect.top) / rect.height;

            if (relX >= 0.14 && relX <= 0.58 && relY >= 0.12 && relY <= 0.62) {
                if (patLastX === null || patLastY === null) {
                    patLastX = e.clientX;
                    patLastY = e.clientY;
                    clearTimeout(patDecayTimer);
                    patDecayTimer = setTimeout(resetPatTracking, 480);
                    return;
                }
                const dx = e.clientX - patLastX;
                const dy = e.clientY - patLastY;
                patLastX = e.clientX;
                patLastY = e.clientY;

                const isMouse = !e.pointerType || e.pointerType === 'mouse';
                const isHorizTouch = e.pointerType && e.pointerType !== 'mouse' && Math.abs(dx) > Math.abs(dy) * 1.4;
                if ((isMouse || isHorizTouch) && Math.abs(dx) > 0) {
                    patDistance += Math.abs(dx);
                    if (Math.abs(dx) >= 6) {
                        const dir = dx > 0 ? 1 : -1;
                        if (patLastDir !== 0 && dir !== patLastDir) {
                            patReversals += 1;
                        }
                        patLastDir = dir;
                    }
                    clearTimeout(patDecayTimer);
                    patDecayTimer = setTimeout(resetPatTracking, 480);

                    if (isPatting && patDistance >= 22) {
                        patDistance = 0;
                        triggerHeadPat();
                    } else if ((patReversals >= 2 && patDistance >= 44) || patDistance >= 115) {
                        patDistance = 0;
                        patReversals = 0;
                        triggerHeadPat();
                    }
                }
            } else {
                resetPatTracking();
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (e.pointerType && e.pointerType !== 'mouse') return;
            if (!isRigInView || isSleeping) return;
            lastPointerX = e.clientX;
            lastPointerY = e.clientY;
            if (parallaxRafId === null) {
                parallaxRafId = window.requestAnimationFrame(applyWindowParallax);
            }
        }, { passive: true });

        document.addEventListener('mouseleave', resetParallax);
        window.addEventListener('blur', resetParallax);

        rig.addEventListener('pointerup', cancelHold);
        rig.addEventListener('pointercancel', cancelHold);

        rig.addEventListener('pointerenter', (e) => {
            if (e.pointerType !== 'mouse') return;
            if (isSleeping) {
                wakeUp();
                return;
            }
            const now = Date.now();
            if (!isActing && now - lastHoverCuriosityAt > 4000 && Math.random() < 0.45) {
                lastHoverCuriosityAt = now;
                setFace({
                    eyeL: 'eye_l_open.webp',
                    eyeR: 'eye_r_closed.webp',
                    mouth: 'mouth_smile.webp',
                    tear: null,
                    emote: 'emote_question.webp'
                });
                clearTimeout(hoverCuriosityTimer);
                hoverCuriosityTimer = setTimeout(() => {
                    if (!isActing && !isSleeping) {
                        setFace(IDLE_FACE);
                    }
                }, 1100);
            }
        });

        rig.addEventListener('pointerleave', () => {
            cancelHold();
            resetPatTracking();
            if (hoverCuriosityTimer) {
                clearTimeout(hoverCuriosityTimer);
                hoverCuriosityTimer = null;
                if (!isActing && !isSleeping) {
                    setFace(IDLE_FACE);
                }
            }
        });

        rig.addEventListener('click', handleInteractionClick);
        rig.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleInteractionClick();
            }
        });

        setFace(IDLE_FACE);
        scheduleNextIdleMicro();
        resetSleepTimer();
    }

    global.initKeikoMascot = function (root) {
        const scope = root || document;
        scope.querySelectorAll('[data-keiko-rig]').forEach(setupRig);
    };
})(window);
