import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export class HolidaysApp {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private present: THREE.Group;
  private pointLight: THREE.PointLight;
  private ambientLight: THREE.AmbientLight;
  private plane: THREE.Mesh;
  private cameraAngle: number = 0; // Angle for camera rotation

  constructor() {
    this.init();
  }

  private init(): void {
    // Loaders
    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();
    const PATH = `/scripts/rewards/holidays/gift-model/gift`;
    // Replace 'path/to/material.mtl' with the path to your actual .mtl file
    mtlLoader.load(PATH.concat(`.mtl`), materials => {
      materials.preload();
      // Update materials to render both sides
      for (const materialName in materials.materials) {
        const material = materials.materials[materialName];
        material.side = THREE.DoubleSide; // Render both sides of the material
      }
      objLoader.setMaterials(materials);

      // Replace 'path/to/model.obj' with the path to your actual .obj file
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
                (mesh.material as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.set(0xffd700); // Gold color
              }
            } else {
              if (
                mesh.material instanceof THREE.MeshPhongMaterial ||
                mesh.material instanceof THREE.MeshStandardMaterial ||
                mesh.material instanceof THREE.MeshBasicMaterial
              ) {
                (mesh.material as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.set(0xffffff); // White color
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

    // Point Light
    this.pointLight = new THREE.PointLight(0xffffff, 1, 0);
    this.pointLight.position.set(0, 2, 0);
    this.pointLight.castShadow = true;
    this.scene.add(this.pointLight);

    // Ambient Light (for overall scene illumination)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
    this.scene.add(this.ambientLight);

    // Set initial camera position
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(this.scene.position);

    // Start the animation loop
    this.animate();
  }

  private _animate = (): void => {
    requestAnimationFrame(this.animate);

    // Rotate the camera around the present
    this.cameraAngle += 0.005;
    this.camera.position.x = 5 * Math.sin(this.cameraAngle);
    // this.camera.position.z = 5 * Math.cos(this.cameraAngle);
    this.camera.lookAt(this.scene.position);

    this.renderer.render(this.scene, this.camera);
  };
  public get animate() {
    return this._animate;
  }
  public set animate(value) {
    this._animate = value;
  }
}
