// The three.js surface this app actually uses — and nothing else.
//
// `import * as THREE from 'three'` (which is what the engine used to do) makes
// webpack emit the library's entire export barrel as its own chunk: measured at
// 87 KB gzipped of pure re-export glue, on top of the 100 KB of implementation.
// That is most of the homepage's 200 KB budget for the 3D layer spent on names
// we never call.
//
// Re-exporting the twenty-odd symbols we do use lets tree-shaking drop the rest
// (three ships ESM and declares `sideEffects: false`). The engine imports this
// module dynamically instead of the package, so `engine.THREE.Foo` keeps
// working for every existing caller — and if someone reaches for a symbol that
// is not here, the build tells them to add it rather than silently re-inflating
// the bundle.

export {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CubicBezierCurve3,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
