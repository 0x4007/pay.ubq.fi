import * as THREE from "three";
import { DragControls } from "three/examples/jsm/controls/DragControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
const COLORS = {
  GOLD: 0xffd700,
  WHITE: 0xffffff,
  RED: 0xff0000,
  GREEN: 0x00ff00,
  BLUE: 0x0000ff,
};

export class HolidaysApp {
  private orbitControls: OrbitControls;
  private rotating: boolean = false; // This will control the toggle
  private dragControls: DragControls;
  private lightVisuals: THREE.Object3D[] = [];
  private lights: THREE.PointLight[] = [];
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private present: THREE.Group;
  // private pointLightBackLeft: THREE.PointLight;
  // private pointLightBackRight: THREE.PointLight;
  // private pointLightFrontRight: THREE.PointLight;
  // private pointLightFrontLeft: THREE.PointLight;
  private ambientLight: THREE.AmbientLight;
  private plane: THREE.Mesh;
  private cameraAngle: number = 0; // Angle for camera rotation

  constructor() {
    this.init();
    this.setupKeyControls();
  }

  private init(): void {
    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();
    const PATH = `/scripts/rewards/holidays/gift-model/gift`;
    mtlLoader.load(PATH.concat(`.mtl`), materials => {
      materials.preload();
      for (const materialName in materials.materials) {
        const material = materials.materials[materialName];
        material.side = THREE.DoubleSide; // Render both sides of the material
      }
      objLoader.setMaterials(materials);

      objLoader.load(PATH.concat(`.obj`), (object): void => {
        object.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.material instanceof THREE.Material) {
              mesh.material.side = THREE.DoubleSide; // Ensure new geometry also has double-sided materials
            }

            if (mesh.name.includes("ribbon")) {
              // Assuming ribbon parts contain 'Ribbon' in their name
              if (
                mesh.material instanceof THREE.MeshPhongMaterial ||
                mesh.material instanceof THREE.MeshStandardMaterial ||
                mesh.material instanceof THREE.MeshBasicMaterial
              ) {
                (mesh.material as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.set(COLORS.GOLD); // Gold color
              }
            } else {
              if (
                mesh.material instanceof THREE.MeshPhongMaterial ||
                mesh.material instanceof THREE.MeshStandardMaterial ||
                mesh.material instanceof THREE.MeshBasicMaterial
              ) {
                (mesh.material as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.set(COLORS.WHITE); // White color
              }
            }
          }
        });
        object.position.y = 0.5; // Adjust the position as needed
        object.scale.set(1, 1, 1); // Scale the object if it's too large or too small
        this.scene.add(object);
      });
    });

    // Scene, Camera, Renderer setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.domElement.id = "holidays";
    document.body.appendChild(this.renderer.domElement);

    // Plane for shadow (now transparent)
    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.0 }); // Fully transparent
    this.plane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.position.y = 0;
    this.plane.receiveShadow = true;
    this.scene.add(this.plane);

    const _lights = [
      { color: COLORS.GOLD, x: 0.75, y: 2, z: -0.75, intensity: 0.25 },
      { color: COLORS.WHITE, x: -0.75, y: 2, z: -0.75, intensity: 2 },
      { color: COLORS.GOLD, x: 1.1, y: -0.5, z: 1.1, intensity: 0.25 },
      // { color: COLORS.BLUE, x: -1.1, y: 1.5, z: -1.1, intensity: 0.25 },
      { color: COLORS.GOLD, x: -0.75, y: 0.5, z: 1.5, intensity: 0.25 },
    ];

    _lights.forEach(light => {
      const pointLight = new THREE.PointLight(light.color, light.intensity, 0);
      pointLight.position.set(light.x, light.y, light.z);
      pointLight.castShadow = true;
      this.scene.add(pointLight);
      this.lights.push(pointLight);

      const lightVisual = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshBasicMaterial({ color: light.color }));
      lightVisual.position.copy(pointLight.position);
      this.scene.add(lightVisual);
      this.lightVisuals.push(lightVisual);
      this.initDragControls();
    });

    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(this.scene.position);

    this.addLightHelpers();
    this.animate();
    this.initOrbitControls();
  }
  private initDragControls(): void {
    this.dragControls = new DragControls(this.lightVisuals, this.camera, this.renderer.domElement);

    this.dragControls.addEventListener("dragstart", event => {
      this.orbitControls.enabled = false;
    });

    this.dragControls.addEventListener("dragend", event => {
      this.orbitControls.enabled = true;
    });

    this.dragControls.addEventListener("drag", event => {
      const selectedObject = event.object;
      const light = this.lights[this.lightVisuals.indexOf(selectedObject)];
      light.position.copy(selectedObject.position);
    });
  }
  private initOrbitControls(): void {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.update();
  }

  private _animate = (): void => {
    requestAnimationFrame(this._animate);

    if (this.rotating) {
      this.cameraAngle += 0.005;
      this.camera.position.x = 5 * Math.sin(this.cameraAngle);
      this.camera.position.z = 5 * Math.cos(this.cameraAngle);
    }
    this.camera.lookAt(this.scene.position);

    this.renderer.render(this.scene, this.camera);
  };
  public get animate() {
    return this._animate;
  }
  public set animate(value) {
    this._animate = value;
  }

  private addLightHelpers(): void {
    this.lights.forEach(light => {
      const helper = new THREE.PointLightHelper(light, 0.1, 0x00ffff);
      this.scene.add(helper);
    });
  }
  private setupKeyControls(): void {
    window.addEventListener("keydown", event => {
      if (event.code === "Space") {
        this.rotating = !this.rotating; // Toggle the rotation state
      }
    });
  }
}
