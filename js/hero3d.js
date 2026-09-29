// Interactive 3D robot for the home-page hero.
// Loaded lazily (dynamic import) so the page paints before Three.js is parsed.
// Usage: const viewer = await mountRobot(containerEl, { src, onReady })

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Box3, Vector3,
  AmbientLight, DirectionalLight, HemisphereLight, PMREMGenerator,
  MeshStandardMaterial, MeshPhysicalMaterial, Mesh, PlaneGeometry, MeshBasicMaterial,
  NeutralToneMapping, SRGBColorSpace, MathUtils, Timer, DoubleSide, CanvasTexture,
  GLTFLoader, MeshoptDecoder, RoomEnvironment,
} from '../vendor/three/three.bundle.min.js';

// Materials are matched by the material name baked into the GLB
// (see tools/robot-pipeline.md). Colors come from the IHOT palette.
const MATERIALS = {
  // Flat shading on large plates hides normal artifacts from mesh simplification.
  frame:  () => new MeshStandardMaterial({ color: 0x22446d, metalness: 0.5, roughness: 0.42, flatShading: true }),
  panel:  () => new MeshPhysicalMaterial({ color: 0x7ea9dd, metalness: 0.0, roughness: 0.08, flatShading: true,
                   transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide, envMapIntensity: 1.4 }),
  metal:  () => new MeshStandardMaterial({ color: 0xb6c2d2, metalness: 0.78, roughness: 0.36 }),
  accent: () => new MeshStandardMaterial({ color: 0x3e75b7, metalness: 0.4, roughness: 0.34 }),
  wheel:  () => new MeshStandardMaterial({ color: 0x141b24, metalness: 0.1, roughness: 0.75 }),
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(126,169,221,0.55)');
  grd.addColorStop(0.45, 'rgba(62,117,183,0.22)');
  grd.addColorStop(1, 'rgba(62,117,183,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export async function mountRobot(container, opts = {}) {
  const {
    src,
    reducedMotion = false,
    pixelRatioCap = 2,
    autoRotateSpeed = 0.18,        // radians / second
    scrollTarget = null,           // element whose scroll progress drives motion
    onReady = () => {},
    onProgress = () => {},
    preserveDrawingBuffer = false,
    maxFps = 60,                   // phones use 30 to save battery
  } = opts;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'robot-canvas';
  container.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  scene.add(new HemisphereLight(0xd6e4f5, 0x07121f, 0.9));
  scene.add(new AmbientLight(0x7ea9dd, 0.15));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const rim = new DirectionalLight(0x7ea9dd, 2.4);
  rim.position.set(-3, 2, -3.5);
  scene.add(rim);
  const fill = new DirectionalLight(0x3e75b7, 0.9);
  fill.position.set(-3, 0.5, 2.5);
  scene.add(fill);

  const camera = new PerspectiveCamera(28, 1, 0.05, 50);

  // pivot (user rotation) > tilt (scroll) > model
  const pivot = new Group();
  const tilt = new Group();
  pivot.add(tilt);
  scene.add(pivot);

  const glow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  pivot.add(glow);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((resolve, reject) => {
    loader.load(src, resolve, (e) => { if (e.total) onProgress(e.loaded / e.total); }, reject);
  });
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) {
      const name = (o.material && o.material.name) || '';
      const make = MATERIALS[name] || MATERIALS.metal;
      o.material = make();
      if (name === 'panel') o.renderOrder = 2;
    }
  });

  // Center the model on its footprint and scale it to ~1 unit wide.
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = 1 / Math.max(size.x, size.z);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale - (size.y * scale) / 2, -center.z * scale);
  tilt.add(model);
  glow.position.y = -(size.y * scale) / 2 - 0.002;
  glow.scale.set(1.9, 1.9, 1.9);

  // --- camera framing -------------------------------------------------
  const baseDist = 2.75;
  function frame() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull back on narrow (portrait) viewports so the robot never clips.
    const portrait = Math.max(1, 1.15 / camera.aspect);
    camera.position.set(0, 1.05, baseDist * portrait);
    camera.lookAt(0, -0.02, 0);
    camera.updateProjectionMatrix();
  }
  frame();
  const ro = new ResizeObserver(frame);
  ro.observe(container);

  // --- render scheduling ------------------------------------------------
  // Frames are only drawn while something is moving (auto-rotate, drag,
  // inertia, scroll easing) and the hero is on-screen in a visible tab.
  const clock = new Timer();
  let visible = true;
  let raf = 0;
  let running = false;
  function wake() {
    if (raf) return;
    if (!visible) { running = false; return; }
    if (!running) { clock.update(); running = true; } // resuming: don't count idle time
    raf = requestAnimationFrame(tick);
  }

  // --- interaction: horizontal drag rotates, vertical drag scrolls the page ---
  let yaw = -0.65;          // starting 3/4 view
  let pitch = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0, lastY = 0, lastMove = 0;
  let idleSince = performance.now();

  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY; lastMove = performance.now();
    velocity = 0;
    canvas.setPointerCapture(e.pointerId);
    container.classList.add('is-dragging');
    wake();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const now = performance.now();
    const dt = Math.max(1, now - lastMove);
    yaw += dx * 0.008;
    if (e.pointerType === 'mouse') pitch = MathUtils.clamp(pitch + dy * 0.004, -0.35, 0.45);
    velocity = MathUtils.clamp((dx * 0.008) / (dt / 1000), -8, 8);
    lastX = e.clientX; lastY = e.clientY; lastMove = now;
    idleSince = now;
    wake();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    idleSince = performance.now();
    if (performance.now() - lastMove > 80) velocity = 0; // released without flicking
    container.classList.remove('is-dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    wake();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Keyboard: the container is focusable; arrow keys rotate.
  container.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      yaw += e.key === 'ArrowLeft' ? -0.25 : 0.25;
      idleSince = performance.now();
      e.preventDefault();
      wake();
    }
  });

  // --- scroll-linked motion -------------------------------------------
  let scrollP = 0;
  function readScroll() {
    if (!scrollTarget || reducedMotion) { scrollP = 0; return; }
    const r = scrollTarget.getBoundingClientRect();
    scrollP = MathUtils.clamp(-r.top / Math.max(1, r.height), 0, 1);
    wake();
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();
  let smoothP = scrollP;

  const minFrameMs = 1000 / maxFps - 2;
  let lastFrame = 0;
  function tick(ts = performance.now()) {
    raf = 0;
    if (ts - lastFrame < minFrameMs) { raf = requestAnimationFrame(tick); return; }
    lastFrame = ts;
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();
    let active = dragging;
    if (!dragging) {
      if (Math.abs(velocity) > 0.002) {
        yaw += velocity * dt;
        velocity *= Math.pow(0.04, dt); // inertia
        active = true;
      } else velocity = 0;
      if (!reducedMotion) {
        active = true; // auto-rotate keeps the loop alive
        if (now - idleSince > 2500) yaw += autoRotateSpeed * dt;
      }
      if (Math.abs(pitch) > 0.001) { pitch += (0 - pitch) * Math.min(1, dt * 2); active = true; }
    }
    if (Math.abs(scrollP - smoothP) > 0.0005) { smoothP += (scrollP - smoothP) * Math.min(1, dt * 6); active = true; }
    else smoothP = scrollP;

    pivot.rotation.y = yaw + smoothP * 1.4;
    tilt.rotation.x = pitch + smoothP * 0.35;
    pivot.position.y = smoothP * 0.28;
    pivot.scale.setScalar(1 - smoothP * 0.18);
    renderer.render(scene, camera);
    if (active) wake();
    else running = false;
  }

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && document.visibilityState === 'visible';
    wake();
  });
  io.observe(container);
  const onVis = () => { visible = document.visibilityState === 'visible'; wake(); };
  document.addEventListener('visibilitychange', onVis);
  const ro2 = new ResizeObserver(() => wake());
  ro2.observe(container);

  tick();
  onReady();

  return {
    canvas,
    renderer,
    setYaw(v) { yaw = v; velocity = 0; tick(); },
    renderOnce() { renderer.render(scene, camera); },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect(); ro2.disconnect();
      window.removeEventListener('scroll', readScroll);
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
      pmrem.dispose();
      canvas.remove();
    },
  };
}
