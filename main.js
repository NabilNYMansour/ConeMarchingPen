import * as THREE from "https://esm.sh/three";
import { OrbitControls } from "https://esm.sh/three/examples/jsm/controls/OrbitControls";
import { fragCode, marchCode, uniformsCode, vertCode } from "./shaders";
import GUI from "https://esm.sh/three/examples/jsm/libs/lil-gui.module.min.js";
import Stats from "https://esm.sh/three/examples/jsm/libs/stats.module.js";

// Create a scene
const scene = new THREE.Scene();

// Add stats
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// Create a camera
const screenRatio = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(75, screenRatio, 0.1, 1000);
camera.position.z = 5;

// Create a renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Set background color
const backgroundColor = new THREE.Color(0x3399ee);
renderer.setClearColor(backgroundColor, 1);

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxDistance = 10;
controls.minDistance = 2;
controls.enableDamping = true;

// Add directional light
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
scene.add(light);

// Create a ray marching plane
let marchingPlaneGeoValues = [1, 1, Math.trunc(camera.aspect*32), 32];
const marchingPlaneMat = new THREE.ShaderMaterial();
let marchingPlaneGeo = new THREE.PlaneGeometry(...marchingPlaneGeoValues);
let marchingPlane = new THREE.Mesh(marchingPlaneGeo, marchingPlaneMat);

// Get the wdith and height of the near plane
const nearPlaneWidth = camera.near * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 2;
const nearPlaneHeight = nearPlaneWidth / camera.aspect;

// Scale the ray marching plane
marchingPlane.scale.set(nearPlaneWidth, nearPlaneHeight, 1);

// Add uniforms
const uniforms = {
  u_eps: { value: 0.001 },
  u_maxDis: { value: 20 },
  u_maxSteps: { value: 100 },

  u_clearColor: { value: backgroundColor },

  u_camPos: { value: camera.position },
  u_camToWorldMat: { value: camera.matrixWorld },
  u_camInvProjMat: { value: camera.projectionMatrixInverse },
  u_camTanFov: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) },
  u_camPlaneSubdivisions: { value: marchingPlaneGeoValues[marchingPlaneGeoValues.length - 1] },

  u_lightDir: { value: light.position },
  u_lightColor: { value: light.color },

  u_diffIntensity: { value: 0.5 },
  u_specIntensity: { value: 3 },
  u_shininess: { value: 16 },
  u_ambientIntensity: { value: 0.15 },

  u_useConeMarching: { value: true },
  u_sdfLOD: { value: 10 },
  u_showConeMarchingEdges: { value: true },
};

marchingPlaneMat.uniforms = uniforms;
marchingPlaneMat.vertexShader = uniformsCode + marchCode + vertCode;
marchingPlaneMat.fragmentShader = uniformsCode + marchCode + fragCode;

// wireframe
const wireframeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0. });
let wireframeGeo = new THREE.PlaneGeometry(...marchingPlaneGeoValues);
let wireframe = new THREE.Mesh(wireframeGeo, wireframeMat);
marchingPlane.add(wireframe);

// Add plane to scene
scene.add(marchingPlane);

// Needed inside update function
let cameraForwardPos = new THREE.Vector3(0, 0, -1);
const VECTOR3ZERO = new THREE.Vector3(0, 0, 0);

// Render the scene
const animate = () => {
  stats.begin();
  requestAnimationFrame(animate);

  // Update screen plane position and rotation
  cameraForwardPos = camera.position.clone().add(camera.getWorldDirection(VECTOR3ZERO).multiplyScalar(camera.near));
  marchingPlane.position.copy(cameraForwardPos);
  marchingPlane.rotation.copy(camera.rotation);

  renderer.render(scene, camera);

  controls.update();

  stats.end();
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  const nearPlaneWidth = camera.near * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 2;
  const nearPlaneHeight = nearPlaneWidth / camera.aspect;
  marchingPlane.scale.set(nearPlaneWidth, nearPlaneHeight, 1);

  if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);

  marchingPlaneGeoValues = [1, 1, Math.trunc(camera.aspect*32), 32]
  marchingPlaneGeo.dispose();
  marchingPlaneGeo = new THREE.PlaneGeometry(...marchingPlaneGeoValues);
  marchingPlane.geometry = marchingPlaneGeo;
  marchingPlaneMat.uniforms.u_camPlaneSubdivisions.value = marchingPlaneGeoValues[marchingPlaneGeoValues.length - 1];
  
  wireframeGeo.dispose();
  wireframeGeo = new THREE.PlaneGeometry(...marchingPlaneGeoValues);
  wireframe.geometry = wireframeGeo;

});

// GUI
const gui = new GUI();
const guiParams = {
  useConeMarching: uniforms.u_useConeMarching.value,
  sdfLOD: uniforms.u_sdfLOD.value,
  wireframe: false,
  showConeMatchingEdges: uniforms.u_showConeMarchingEdges.value,

  eps: uniforms.u_eps.value,
  maxDis: uniforms.u_maxDis.value,
  maxSteps: uniforms.u_maxSteps.value,
};

// ------------------------------------------------- //
const generalSettings = gui.addFolder('General Settings');


generalSettings.add(guiParams, 'useConeMarching', true, false).onChange((value) => {
  uniforms.u_useConeMarching.value = value;
}).name('Use Cone Marching');

generalSettings.add(guiParams, 'sdfLOD', 5, 20).step(1).onChange((value) => {
  uniforms.u_sdfLOD.value = value;
}).name('SDF Level of Detail');

generalSettings.add(guiParams, 'wireframe', true, false).onChange((value) => {
  wireframeMat.opacity = value ? 0.1 : 0;
}).name('Show Subdivisions');

generalSettings.add(guiParams, 'showConeMatchingEdges', true, false).onChange((value) => {
  uniforms.u_showConeMarchingEdges.value = value;
}).name('Show Cone Marching Edges');
// ------------------------------------------------- //
const renderingSettings = gui.addFolder('Rendering Settings');


renderingSettings.add(guiParams, 'eps', 0.0001, 0.01).onChange((value) => {
  uniforms.u_eps.value = value;
}).name('Hit Epsilon');

renderingSettings.add(guiParams, 'maxSteps', 10, 200).step(1).onChange((value) => {
  uniforms.u_maxSteps.value = value;
}).name('Max Steps');
// ------------------------------------------------- //