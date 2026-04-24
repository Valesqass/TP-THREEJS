import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Water } from 'three/addons/objects/Water.js'

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0xb86a4a, 0.008)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(0, 25, 50)

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI / 2.2


const SUN_DIRECTION = new THREE.Vector3(-0.6, 0.08, -0.8).normalize()

const skyUniforms = {
  uSunDir: { value: SUN_DIRECTION.clone() },
  uZenithColor: { value: new THREE.Color(0x1a0b33) },
  uMidColor: { value: new THREE.Color(0x8a2e5a) },
  uHorizonColor: { value: new THREE.Color(0xff8a3d) },
  uSunColor: { value: new THREE.Color(0xfff1c4) },
  uHaloColor: { value: new THREE.Color(0xff9240) }
}

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: skyUniforms,
  vertexShader: `
    varying vec3 vWorldDir;
    void main() {
      vWorldDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uSunDir;
    uniform vec3 uZenithColor;
    uniform vec3 uMidColor;
    uniform vec3 uHorizonColor;
    uniform vec3 uSunColor;
    uniform vec3 uHaloColor;
    varying vec3 vWorldDir;

    void main() {
      vec3 dir = normalize(vWorldDir);
      float h = clamp(dir.y, -1.0, 1.0);

      float tHorizon = smoothstep(-0.05, 0.25, h);
      float tZenith  = smoothstep(0.25, 0.85, h);
      vec3 col = mix(uHorizonColor, uMidColor, tHorizon);
      col      = mix(col, uZenithColor, tZenith);

      float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
      float wideGlow  = pow(sunDot, 3.0) * 0.55;
      float tightGlow = pow(sunDot, 32.0) * 0.9;
      col += uHaloColor * wideGlow;
      col += uSunColor  * tightGlow;

      float sunDisk = smoothstep(0.9985, 0.9995, sunDot);
      col = mix(col, uSunColor, sunDisk);

      float horizonBand = exp(-abs(h) * 18.0) * 0.35;
      col += uHorizonColor * horizonBand;

      float under = smoothstep(0.0, -0.15, h);
      col = mix(col, uHorizonColor * 0.4, under);

      gl_FragColor = vec4(col, 1.0);
    }
  `
})

const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 32), skyMat)
skyMesh.renderOrder = -1
scene.add(skyMesh)



const noise = new ImprovedNoise()
const tSize = 200
const tSeg = 256
const z = 42.17

const RIVER_AMPL = 10
const RIVER_FREQ = 0.045
function riverCurve(x) {
  return Math.sin(x * RIVER_FREQ) * RIVER_AMPL + Math.sin(x * 0.02 + 1.3) * 4
}

const CHANNEL_HALFWIDTH = 18
const CHANNEL_DEPTH = 7
function basinOffset(x, y) {
  const d = Math.abs(y - riverCurve(x))
  const t = Math.max(0, 1 - d / CHANNEL_HALFWIDTH)
  return t * t * (3 - 2 * t) * CHANNEL_DEPTH
}

const geo = new THREE.PlaneGeometry(tSize, tSize, tSeg, tSeg)
const verts = geo.attributes.position.array

for (let i = 0; i < verts.length; i += 3) {
  const x = verts[i]
  const y = verts[i + 1]

  let h = noise.noise(x * 0.015, y * 0.015, z) * 10
  h += noise.noise(x * 0.04, y * 0.04, z) * 4
  h += noise.noise(x * 0.08, y * 0.08, z) * 2
  h += noise.noise(x * 0.15, y * 0.15, z) * 0.8
  h -= basinOffset(x, y)

  verts[i + 2] = h
}
geo.computeVertexNormals()

// textures sol
const texLoader = new THREE.TextureLoader()

const colorMap = texLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg')
colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping
colorMap.repeat.set(20, 20)

const normalMap = texLoader.load('https://threejs.org/examples/textures/waternormals.jpg')
normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping
normalMap.repeat.set(20, 20)

const cvs = document.createElement('canvas')
cvs.width = cvs.height = 512
const ctx = cvs.getContext('2d')
const imgData = ctx.createImageData(512, 512)
for (let i = 0; i < imgData.data.length; i += 4) {
  const v = 180 + Math.floor(Math.random() * 62)
  imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = v
  imgData.data[i + 3] = 255
}
ctx.putImageData(imgData, 0, 0)
const roughnessMap = new THREE.CanvasTexture(cvs)
roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping
roughnessMap.repeat.set(20, 20)

const mat = new THREE.MeshStandardMaterial({
  map: colorMap,
  normalMap: normalMap,
  normalScale: new THREE.Vector2(0.4, 0.4),
  roughnessMap: roughnessMap,
  roughness: 0.9,
  metalness: 0.0
})

const terrain = new THREE.Mesh(geo, mat)
terrain.rotation.x = -Math.PI / 2
terrain.receiveShadow = true
scene.add(terrain)

// lumieres
const ambientLight = new THREE.HemisphereLight(0xff8a3d, 0x2a1340, 0.55)
scene.add(ambientLight)

const sunLight = new THREE.DirectionalLight(0xffb070, 2.2)
sunLight.position.copy(SUN_DIRECTION).multiplyScalar(120)
sunLight.castShadow = true
sunLight.shadow.mapSize.width = 1024
sunLight.shadow.mapSize.height = 1024
sunLight.shadow.camera.left = -120
sunLight.shadow.camera.right = 120
sunLight.shadow.camera.top = 120
sunLight.shadow.camera.bottom = -120
sunLight.shadow.bias = -0.001
sunLight.shadow.autoUpdate = false
sunLight.shadow.needsUpdate = true
scene.add(sunLight)

const lampA = new THREE.PointLight(0xff7a33, 40, 60, 2)
lampA.position.set(12, 6, -8)
lampA.castShadow = true
scene.add(lampA)

const lampB = new THREE.PointLight(0x66c8ff, 25, 80, 2)
lampB.position.set(-20, 8, 15)
scene.add(lampB)

function heightAt(x, y) {
  let h = noise.noise(x * 0.015, y * 0.015, z) * 10
  h += noise.noise(x * 0.04, y * 0.04, z) * 4
  h += noise.noise(x * 0.08, y * 0.08, z) * 2
  h += noise.noise(x * 0.15, y * 0.15, z) * 0.8
  h -= basinOffset(x, y)
  return h
}

const RIVER_LENGTH = tSize
const WATER_HALFWIDTH = 10

let minEdgeH = Infinity
const EDGE_SAMPLES = 80
for (let i = 0; i <= EDGE_SAMPLES; i++) {
  const xs = (i / EDGE_SAMPLES - 0.5) * RIVER_LENGTH
  const yc = riverCurve(xs)
  const eh1 = heightAt(xs, yc + WATER_HALFWIDTH)
  const eh2 = heightAt(xs, yc - WATER_HALFWIDTH)
  if (eh1 < minEdgeH) minEdgeH = eh1
  if (eh2 < minEdgeH) minEdgeH = eh2
}
const waterLevel = minEdgeH - 0.4

const waterGeo = new THREE.PlaneGeometry(RIVER_LENGTH, WATER_HALFWIDTH * 2, 160, 2)
const wverts = waterGeo.attributes.position.array
for (let i = 0; i < wverts.length; i += 3) {
  wverts[i + 1] += riverCurve(wverts[i])
}
waterGeo.computeVertexNormals()

const water = new Water(waterGeo, {
  textureWidth: 128,
  textureHeight: 128,
  waterNormals: texLoader.load('https://threejs.org/examples/textures/waternormals.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
  }),
  sunDirection: SUN_DIRECTION.clone(),
  sunColor: 0xffb070,
  waterColor: 0x2a4a3a,
  distortionScale: 2.0,
  fog: true
})
water.rotation.x = -Math.PI / 2
water.position.set(0, waterLevel, 0)
scene.add(water)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  fireflyUniforms.uPixelRatio.value = renderer.getPixelRatio()
})

const GRASS_COUNT = 12000
const BLADE_W = 0.45
const BLADE_H = 0.45

const planeA = new THREE.PlaneGeometry(BLADE_W, BLADE_H, 1, 4)
const planeB = new THREE.PlaneGeometry(BLADE_W, BLADE_H, 1, 4)
planeB.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))
const bladeGeo = mergeGeometries([planeA, planeB])

bladeGeo.translate(0, BLADE_H / 2, 0)

const grassColorTex = texLoader.load('./assets/herbe.png')
const grassNormalTex = texLoader.load('./assets/normal2.png')
const grassRmaoTex = texLoader.load('./assets/rmao.png')
grassColorTex.colorSpace = THREE.SRGBColorSpace

const bladeMat = new THREE.MeshStandardMaterial({
  map: grassColorTex,
  normalMap: grassNormalTex,
  roughnessMap: grassRmaoTex,
  roughness: 1.0,
  metalness: 0.0,
  alphaTest: 0.35,
  side: THREE.DoubleSide
})


const windUniforms = { uTime: { value: 0.0 } }

bladeMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = windUniforms.uTime

  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
    uniform float uTime;`
  )

  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    float windStrength = uv.y * uv.y;
    float phase = instanceMatrix[3].x * 0.25 + instanceMatrix[3].z * 0.2;
    transformed.x += sin(uTime * 1.8 + phase) * windStrength * 0.55;
    transformed.z += cos(uTime * 1.4 + phase) * windStrength * 0.28;`
  )
}

const grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, GRASS_COUNT)
grassMesh.castShadow = false
grassMesh.receiveShadow = false

const dummy = new THREE.Object3D()

const riverExcludeDist = WATER_HALFWIDTH + 0.3
let placed = 0
let guard = 0
while (placed < GRASS_COUNT && guard < GRASS_COUNT * 4) {
  guard++
  const xl = (Math.random() - 0.5) * tSize
  const yl = (Math.random() - 0.5) * tSize
  if (Math.abs(yl - riverCurve(xl)) < riverExcludeDist) continue

  const h = heightAt(xl, yl)
  dummy.position.set(xl, h - 0.12, -yl)
  dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
  dummy.scale.setScalar(0.6 + Math.random() * 1.0)
  dummy.updateMatrix()
  grassMesh.setMatrixAt(placed, dummy.matrix)
  placed++
}


grassMesh.instanceMatrix.needsUpdate = true
scene.add(grassMesh)

function makeCrossedPlanes(w, h) {
  const a = new THREE.PlaneGeometry(w, h, 1, 1)
  const b = new THREE.PlaneGeometry(w, h, 1, 1)
  b.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))
  const g = mergeGeometries([a, b])
  g.translate(0, h * 0.35, 0)
  return g
}

function scatterInstanced(tex, geo, count, scaleMin, scaleMax) {
  tex.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0
  })
  const mesh = new THREE.InstancedMesh(geo, m, count)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const d = new THREE.Object3D()
  const exclDist = WATER_HALFWIDTH + 1.0
  let n = 0
  let tries = 0
  while (n < count && tries < count * 4) {
    tries++
    const xl = (Math.random() - 0.5) * tSize
    const yl = (Math.random() - 0.5) * tSize
    if (Math.abs(yl - riverCurve(xl)) < exclDist) continue
    const h = heightAt(xl, yl)
    d.position.set(xl, h - 0.15, -yl)
    d.rotation.set(0, Math.random() * Math.PI * 2, 0)
    d.scale.setScalar(scaleMin + Math.random() * (scaleMax - scaleMin))
    d.updateMatrix()
    mesh.setMatrixAt(n, d.matrix)
    n++
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

scene.add(scatterInstanced(texLoader.load('./assets/impostor.png'), makeCrossedPlanes(3, 2.5), 400, 0.8, 1.6))
scene.add(scatterInstanced(texLoader.load('./assets/impostor2.png'), makeCrossedPlanes(1.2, 1.2), 800, 0.6, 1.2))

const FIREFLY_COUNT = 1200
const fireflyGeo = new THREE.BufferGeometry()
const fireflyPos = new Float32Array(FIREFLY_COUNT * 3)
const fireflySeed = new Float32Array(FIREFLY_COUNT)
const fireflyAmp = new Float32Array(FIREFLY_COUNT * 3)

for (let i = 0; i < FIREFLY_COUNT; i++) {
  const xl = (Math.random() - 0.5) * tSize * 0.95
  const yl = (Math.random() - 0.5) * tSize * 0.95
  const groundH = heightAt(xl, yl)
  const baseY = Math.max(groundH, waterLevel) + 1.5 + Math.random() * 10

  fireflyPos[i * 3 + 0] = xl
  fireflyPos[i * 3 + 1] = baseY
  fireflyPos[i * 3 + 2] = -yl

  fireflySeed[i] = Math.random() * 1000.0
  fireflyAmp[i * 3 + 0] = 1.2 + Math.random() * 2.0
  fireflyAmp[i * 3 + 1] = 0.6 + Math.random() * 1.4
  fireflyAmp[i * 3 + 2] = 1.2 + Math.random() * 2.0
}

fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3))
fireflyGeo.setAttribute('aSeed', new THREE.BufferAttribute(fireflySeed, 1))
fireflyGeo.setAttribute('aAmp', new THREE.BufferAttribute(fireflyAmp, 3))

const fireflyUniforms = {
  uTime: { value: 0 },
  uPixelRatio: { value: renderer.getPixelRatio() },
  uSize: { value: 90.0 },
  uColorWarm: { value: new THREE.Color(0xffd27a) },
  uColorHot: { value: new THREE.Color(0xff7a33) }
}

const fireflyMat = new THREE.ShaderMaterial({
  uniforms: fireflyUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uSize;
    attribute float aSeed;
    attribute vec3 aAmp;
    varying float vFlicker;

    void main() {
      vec3 p = position;
      float t = uTime * 0.6 + aSeed;
      p.x += sin(t * 1.1 + aSeed * 0.7) * aAmp.x;
      p.y += sin(t * 0.8 + aSeed * 1.3) * aAmp.y;
      p.z += cos(t * 1.0 + aSeed * 0.5) * aAmp.z;
      p.x += sin(t * 0.27) * 0.8;
      p.z += cos(t * 0.31) * 0.8;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * uPixelRatio / max(-mv.z, 0.1);

      vFlicker = 0.55 + 0.45 * sin(uTime * 4.0 + aSeed * 6.2831);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorWarm;
    uniform vec3 uColorHot;
    varying float vFlicker;

    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float d = length(uv);
      if (d > 0.5) discard;
      float core = smoothstep(0.5, 0.0, d);
      float halo = smoothstep(0.5, 0.15, d) * 0.35;
      vec3 col = mix(uColorWarm, uColorHot, 0.35) * (core * 1.4 + halo);
      float alpha = (core + halo) * vFlicker;
      gl_FragColor = vec4(col, alpha);
    }
  `
})

const fireflies = new THREE.Points(fireflyGeo, fireflyMat)
fireflies.frustumCulled = false
scene.add(fireflies)

const keys = Object.create(null)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault()
  keys[e.code] = true
})
window.addEventListener('keyup', (e) => { keys[e.code] = false })
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false })

const MOVE_SPEED = 22
const moveForward = new THREE.Vector3()
const moveRight = new THREE.Vector3()
const moveDelta = new THREE.Vector3()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

function updateKeyboardMovement(dt) {
  let fwd = 0, strafe = 0, vert = 0
  if (keys['KeyW'] || keys['ArrowUp']) fwd += 1
  if (keys['KeyS'] || keys['ArrowDown']) fwd -= 1
  if (keys['KeyD'] || keys['ArrowRight']) strafe += 1
  if (keys['KeyA'] || keys['ArrowLeft']) strafe -= 1
  if (keys['Space']) vert += 1
  if (keys['ShiftLeft'] || keys['ShiftRight']) vert -= 1
  if (!fwd && !strafe && !vert) return

  camera.getWorldDirection(moveForward)
  moveForward.y = 0
  if (moveForward.lengthSq() < 1e-6) moveForward.set(0, 0, -1)
  moveForward.normalize()
  moveRight.crossVectors(moveForward, WORLD_UP).normalize()

  moveDelta.set(0, 0, 0)
  moveDelta.addScaledVector(moveForward, fwd)
  moveDelta.addScaledVector(moveRight, strafe)
  moveDelta.addScaledVector(WORLD_UP, vert)
  if (moveDelta.lengthSq() > 1) moveDelta.normalize()
  moveDelta.multiplyScalar(MOVE_SPEED * dt)

  camera.position.add(moveDelta)
  controls.target.add(moveDelta)
}

let paused = false
const pauseBtn = document.getElementById('pauseBtn')
pauseBtn.addEventListener('click', () => {
  paused = !paused
  pauseBtn.textContent = paused ? '▶' : '⏸'
  pauseBtn.setAttribute('aria-label', paused ? 'Lecture' : 'Pause')
})

const FIXED_DT = 1 / 60
let simTime = 0

const fpsEl = document.getElementById('fpsVal')
const triEl = document.getElementById('triVal')
let fpsFrames = 0
let fpsLast = performance.now()

function animate(now) {
  requestAnimationFrame(animate)

  updateKeyboardMovement(FIXED_DT)
  controls.update()

  if (!paused) {
    simTime += FIXED_DT
    windUniforms.uTime.value = simTime
    water.material.uniforms.time.value += FIXED_DT
    fireflyUniforms.uTime.value = simTime
  }

  renderer.render(scene, camera)

  fpsFrames++
  const elapsed = now - fpsLast
  if (elapsed >= 500) {
    const raw = (fpsFrames * 1000) / elapsed
    const fps = Math.min(60, Math.round(raw))
    fpsEl.textContent = fps
    triEl.textContent = renderer.info.render.triangles.toLocaleString('fr-FR')
    fpsEl.style.color = fps >= 55 ? '#9fe870' : fps >= 30 ? '#ffd27a' : '#ff7a7a'
    fpsLast = now
    fpsFrames = 0
  }
}
requestAnimationFrame(animate)
