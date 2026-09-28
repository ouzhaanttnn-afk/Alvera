// The monogram geometry comes from the original PDF, not a font or image crop.
const stage = document.querySelector('#sculpture-stage');
const canvas = document.querySelector('#sculpture-canvas');
const motionButton = document.querySelector('.scene-motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const sceneStatus = document.createElement('p');
sceneStatus.className = 'scene-status';
sceneStatus.setAttribute('role', 'status');
sceneStatus.setAttribute('aria-live', 'polite');
sceneStatus.hidden = true;
motionButton?.parentElement?.after(sceneStatus);
function setSceneStatus(message) {
  sceneStatus.textContent = message;
  sceneStatus.hidden = !message;
}


async function createSculpture() {
  const [THREE, artwork] = await Promise.all([
    import('./assets/vendor/three.module.min.js'),
    fetch('./assets/alvera-monogram.json').then(response => {
      if (!response.ok) throw new Error('Monogram unavailable');
      return response.json();
    })
  ]);
  const compact = matchMedia('(max-width: 700px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: compact ? 'low-power' : 'high-performance' });
  const dpr = Math.min(devicePixelRatio || 1, compact ? 1.5 : 1.8);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, .1, 50);
  camera.position.set(0, .15, 9.2);
  camera.lookAt(0, 0, 0);
  const world = new THREE.Group();
  scene.add(world);

  // A virtual photographic studio gives the metal broad, physical reflections.
  function refreshEnvironment() {
    scene.environment?.dispose();
    const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: '#34433f', side: THREE.BackSide })));
  const softbox = (x, y, z, width, height, color) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  };
  softbox(-4, 5, 6, 3, 10, new THREE.Color(7, 6, 4.5));
  softbox(5, 1, 4, 1.4, 9, new THREE.Color(4, 4.5, 4.4));
  softbox(0, 6, -3, 9, 2, new THREE.Color(6, 4.4, 2.5));
  softbox(-5, -3, -4, 2, 6, new THREE.Color(1.2, 2.1, 2.2));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .025);
  scene.environment = environment.texture;
  pmrem.dispose();
  studio.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
  refreshEnvironment();

  const gold = new THREE.MeshPhysicalMaterial({ color: '#e3be78', metalness: 1, roughness: .19, envMapIntensity: 1.35, clearcoat: .55, clearcoatRoughness: .16 });
  const goldEdge = new THREE.MeshStandardMaterial({ color: '#a56e28', metalness: 1, roughness: .23, envMapIntensity: 1.2 });
  const monogram = new THREE.Group();
  world.add(monogram);
  for (const outline of artwork.paths) {
    const path = new THREE.ShapePath();
    for (const [command, ...p] of outline.commands) {
      if (command === 'M') path.moveTo(...p);
      if (command === 'L') path.lineTo(...p);
      if (command === 'C') path.bezierCurveTo(...p);
      if (command === 'Z') path.currentPath.closePath();
    }
    if (outline.fill) {
      for (const shape of path.toShapes(false)) {
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: .30, bevelEnabled: true, bevelThickness: .022, bevelSize: .012, bevelSegments: 4, curveSegments: 28, steps: 1 });
        geometry.translate(0, 0, -.15);
        monogram.add(new THREE.Mesh(geometry, [gold, goldEdge]));
      }
    } else {
      for (const subpath of path.subPaths) {
        const vertices = subpath.getPoints(32).map(p => new THREE.Vector3(p.x, p.y, .15));
        if (vertices.length < 2) continue;
        const curve = new THREE.CurvePath();
        for (let i = 1; i < vertices.length; i++) curve.add(new THREE.LineCurve3(vertices[i - 1], vertices[i]));
        const radius = Math.max(.008, outline.width / 2);
        const front = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, vertices.length * 2), radius, 8, false), gold);
        const back = front.clone();
        back.position.z = -.30;
        monogram.add(front, back);
        for (const endpoint of [vertices[0], vertices[vertices.length - 1]]) {
          const edge = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .30, 8), goldEdge);
          edge.rotation.x = Math.PI / 2;
          edge.position.set(endpoint.x, endpoint.y, 0);
          monogram.add(edge);
        }
      }
    }
  }
  monogram.position.set(0, .06, .3);
  monogram.rotation.set(-.14, -.32, -.015);

  scene.add(new THREE.HemisphereLight(0xf8edd4, 0x18383f, 1.25));
  const key = new THREE.DirectionalLight(0xffedc6, 3.3);
  key.position.set(-3, 4, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbee5e6, 3.4);
  rim.position.set(4, 2, -2); scene.add(rim);
  const pointerLight = new THREE.PointLight(0xffdc99, 12, 12, 2);
  pointerLight.position.set(1, 1.5, 4); scene.add(pointerLight);

  const galaxy = new THREE.Group();
  galaxy.rotation.set(.94, -.23, -.32);
  world.add(galaxy);
  const orbitGold = new THREE.MeshStandardMaterial({ color: '#d2af65', metalness: .9, roughness: .24, envMapIntensity: 1.3, transparent: true, opacity: .9 });
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(2.45, .019, 8, 220), orbitGold);
  galaxy.add(orbit);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(2.98, .008, 6, 240), new THREE.MeshBasicMaterial({ color: '#c6ae76', transparent: true, opacity: .36 }));
  outer.rotation.set(-.52, .31, -.3); world.add(outer);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(2.12, .007, 6, 190), new THREE.MeshBasicMaterial({ color: '#c6ae76', transparent: true, opacity: .28 }));
  inner.rotation.set(.28, .65, .42); world.add(inner);

  let seed = 417;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const count = compact ? 950 : 1700;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const radius = 1.9 + random() * 1.3;
    const angle = (i % 3) * Math.PI * 2 / 3 + radius * 2.5 + (random() - .5) * .65;
    positions.set([Math.cos(angle) * radius, Math.sin(angle) * radius, (random() - .5) * .19], i * 3);
    sizes[i] = .65 + Math.pow(random(), 4) * 3;
    phases[i] = random() * Math.PI * 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  dustGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDpr: { value: dpr } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uDpr; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uDpr * 8.0 / -mv.z, 1.0, 7.0); vAlpha = .38 + .3 * sin(uTime * .7 + aPhase); }`,
    fragmentShader: `varying float vAlpha; void main() { vec2 uv = gl_PointCoord - .5; float glow = exp(-16.0 * dot(uv,uv));
      gl_FragColor = vec4(1.0, .78, .4, glow * vAlpha); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  galaxy.add(dust);

  // Soft pinpoints with fading trails, all moving on real 3D orbits.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const ctx = glowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0, 'rgba(255,250,221,1)');
  gradient.addColorStop(.08, 'rgba(255,231,172,.95)');
  gradient.addColorStop(.22, 'rgba(232,187,102,.25)');
  gradient.addColorStop(1, 'rgba(232,187,102,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,128,128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const travelers = [];
  for (let j = 0; j < 3; j++) {
    const traveler = new THREE.Group();
    const radius = 2.45 + j * .23;
    const material = new THREE.SpriteMaterial({ map: glowTexture, color: j === 1 ? 0xd5f0ef : 0xffdf9e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glint = new THREE.Sprite(material); glint.scale.setScalar(j === 0 ? .24 : .16); glint.position.x = radius;
    traveler.add(glint);
    const trailPoints = [], trailColors = [];
    for (let k = 0; k < 65; k++) {
      const angle = -k / 64 * .65;
      trailPoints.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
      const intensity = Math.pow(1 - k / 64, 2) * .8;
      trailColors.push(intensity, intensity * .72, intensity * .34);
    }
    const trail = new THREE.BufferGeometry().setFromPoints(trailPoints);
    trail.setAttribute('color', new THREE.Float32BufferAttribute(trailColors, 3));
    traveler.add(new THREE.Line(trail, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false })));
    traveler.rotation.z = j * 2.1;
    galaxy.add(traveler);
    travelers.push(traveler);
  }

  const starPositions = [];
  for (let i = 0; i < 110; i++) starPositions.push((random() - .5) * 9, (random() - .5) * 7, -1 - random() * 3);
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)), new THREE.PointsMaterial({ color: '#d9caa2', size: .014, transparent: true, opacity: .48, depthWrite: false }));
  world.add(stars);

  let paused = reducedMotion.matches;
  let visible = true;
  let contextLost = false;
  let frame = 0, last = 0, time = 0;
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const hero = document.querySelector('.hero');
  function draw(now = performance.now()) {
    frame = 0;
    if (contextLost) return;
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    if (!paused) time += dt;
    const ease = 1 - Math.exp(-dt * 3.5);
    pointer.x += (target.x - pointer.x) * ease;
    pointer.y += (target.y - pointer.y) * ease;
    world.rotation.y = pointer.x * .22;
    world.rotation.x = pointer.y * .11;
    // A full turn, rather than the previous barely visible seven-degree sway.
    const turn = (time * Math.PI * 2 / 18) % (Math.PI * 2);
    // Keep a complete revolution, with a longer, readable front-facing moment.
    monogram.rotation.y = -.32 + turn - .65 * Math.sin(turn);
    monogram.rotation.x = -.14 + Math.sin(time * .45) * .08;
    monogram.position.y = .06 + Math.sin(time * .8) * .08;
    galaxy.rotation.z = -.32 + time * .085;
    dust.rotation.z = time * .045;
    outer.rotation.z = -.3 - time * .06;
    inner.rotation.y = .65 + Math.sin(time * .25) * .22;
    travelers.forEach((traveler, i) => { traveler.rotation.z = i * 2.1 + time * (.32 + i * .045); });
    pointerLight.position.x = 1 + pointer.x * 3;
    pointerLight.position.y = 1.5 - pointer.y * 2;
    dustMaterial.uniforms.uTime.value = time;
    renderer.render(scene, camera);
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (visible && !document.hidden && !contextLost) draw();
  }
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Preserve the complete sculpture in portrait and narrow desktop columns.
    camera.position.z = Math.max(8.9, 8.35 / camera.aspect);
    camera.updateProjectionMatrix();
    sync();
  }
  function updateButton() {
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? '3D dönüşü başlat' : '3D dönüşü durdur';
  }
  motionButton.addEventListener('click', () => { paused = !paused; updateButton(); sync(); });
  reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; target.x = target.y = 0; pointer.x = pointer.y = 0; updateButton(); sync(); });
  hero.addEventListener('pointermove', event => {
    if (paused || event.pointerType === 'touch') return;
    const rect = hero.getBoundingClientRect();
    target.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    target.y = (event.clientY - rect.top) / rect.height * 2 - 1;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { target.x = target.y = 0; });
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { rootMargin: '80px' });
  observer.observe(stage);
  new ResizeObserver(resize).observe(stage);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    stage.classList.remove('is-ready');
    motionButton.hidden = true;
    setSceneStatus('3D görünüm toparlanıyor. Bu sırada hafif görünüm gösteriliyor.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      refreshEnvironment();
      scene.traverse(object => {
        const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        for (const material of materials) {
          material.needsUpdate = true;
          if (material.map) material.map.needsUpdate = true;
        }
      });
      contextLost = false;
      stage.classList.add('is-ready');
      motionButton.hidden = false;
      setSceneStatus('');
      updateButton();
      resize();
    } catch (error) {
      contextLost = true;
      stage.classList.remove('is-ready');
      motionButton.hidden = true;
      setSceneStatus('Hafif görünüm etkin. 3D için sayfayı yenileyebilirsiniz.');
      console.warn('Alvera 3D recovery unavailable', error);
    }
  });
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame));
  window.addEventListener('pageshow', sync);
  resize();
  updateButton();
  motionButton.hidden = false;
  stage.classList.add('is-ready');
}

if (stage && canvas) createSculpture().catch(error => {
  // The original vector monogram remains visible without WebGL or JavaScript imports.
  stage.classList.remove('is-ready');
    setSceneStatus('Hafif görünüm etkin. 3D sahne şu anda kullanılamıyor.');
  motionButton.hidden = true;
  console.warn('Alvera: using the lightweight sculpture fallback.', error);
});
