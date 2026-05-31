class Viewer {
  monochrome = false;
  controls;
  points;
  mesh;
  wireframe;
  occHasScalars;
  occupancy;
  axis;
  lastTime;

  constructor() {
    // Three JS instances
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45.0, window.innerWidth / window.innerHeight, 0.1, 5000.0
    );
    this.stats = new Stats();
    this.stats.showPanel(0);
    this.gridHelper = null;
    this.axisHelper = null;
    this.gui = new dat.GUI();

    // Parameters
    this.params = JSON.parse(
      document.getElementById('vscode-3dviewer-data').getAttribute('data-settings')
    );
    this.params.gridHelper = {
      size: 2000,
      unit: 1
    };
    this.params.cameraPosition = {
      x: 0,
      y: 0,
      z: 0
    };
    this.params.cameraTarget = {
      x: 0,
      y: 0,
      z: 0
    };
    this.params.selectedView = null;
    this.params.selectedViewIdx = 0;
    this.params.selectedViewName = 'view0'; // 初始显示
    this.params.imgOpacity = 1.0;
    this.params.rayOpacity = 1.0;
    this.pointCircleTexture = null;
    this.occHasScalars = false;
    this.occupancy = null;
    
    this.cameraViewUpChoices = {
      'x+': [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)],
      'x-': [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)],
      'y+': [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)],
      'y-': [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)],
      'z+': [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
      'z-': [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    };

    // GUI
    this.initRenderer();
    this.initScene();
    this.initLight();
    this.initHelpers();

    // check extension
    this.addMesh(this.params.fileToLoad);

    // add DOM
    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(this.stats.domElement);
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
  }

  initGui() {
    // geometry based parameter update
    var extent;
    if (this.points !== undefined && this.points !== null) {
      extent = getBBoxMaxExtent(this.points.geometry);
    } else {
      extent = 10;
    }
    this.params.pointSize = extent / 1000.0;
    this.params.pointMaxSize = extent / 20.0;

    // this.params.gridHelper.unit = Math.pow(10, Math.floor(Math.log10(extent)));
    // this.params.gridHelper.size = this.params.gridHelper.unit * 1000;
    this.params.gridHelper.unit = 1;
    this.params.gridHelper.size = extent;

    // set gui
    console.log(this.params);
    this.gui.add(this.params, 'showPoints')
      .name('Points');
    this.gui.add(this.params, 'pointSize')
      .min(0).max(this.params.pointMaxSize)
      .name('Point size');
    this.gui.add(this.params, 'pointShape', ['square', 'circle'])
      .name('Point shape')
      .onChange(() => {
        this.updatePointMaterials();
      });
    this.gui.add(this.params, 'camSize')
      .min(0).max(10)
      .name('Camera size');
    this.gui.addColor(this.params, 'pointColor')
      .name('Point color');
    this.gui.add(this.params, 'showWireframe')
      .name('Wireframe');
    this.gui.addColor(this.params, 'wireframeColor')
      .name('Wireframe color');
    this.gui.add(this.params, 'showMesh')
      .name('Mesh');
    const isOccupancyMesh = this.mesh !== undefined && this.mesh !== null && (
      this.mesh.isInstancedMesh ||
      (this.mesh.userData !== undefined && this.mesh.userData.occUniforms !== undefined) ||
      (this.mesh.userData !== undefined && this.mesh.userData.occLabelEntries !== undefined) ||
      (this.mesh.userData !== undefined && this.mesh.userData.occBatches !== undefined)
    );
    if (isOccupancyMesh) {
      this.gui.add(this.params, 'occVoxelSize')
        .min(0.1).max(5).step(0.1)
        .name('Voxel size')
        .onChange(() => {
          this.updateOccupancyScale();
        });
      this.gui.add(this.params, 'occCenterXY')
        .name('Center XY')
        .onChange(() => {
          this.applyOccupancyDisplayState(true);
        });
      if (this.mesh.userData !== undefined && this.mesh.userData.occLabelEntries !== undefined) {
        const occFolder = this.gui.addFolder('OCC Labels');
        this.mesh.userData.occLabelEntries
          .slice()
          .sort((a, b) => a.scalar - b.scalar)
          .forEach(entry => {
            const key = `occLabel_${entry.scalar}`;
            if (this.params[key] === undefined) {
              this.params[key] = true;
            }
            occFolder.add(this.params, key)
              .name(`L${entry.scalar} (${entry.count})`)
              .onChange(value => {
                this.updateOccupancyLabelVisibility(entry.scalar, value);
              });
            if (!this.params[key]) {
              this.updateOccupancyLabelVisibility(entry.scalar, false);
            }
          });
      }
    }
    this.gui.addColor(this.params, 'backgroundColor')
      .name('Background color');
    this.gui.add(this.params, 'showAxesHelper')
      .name('showAxes');
    this.gui.add(this.params, 'cameraViewUp', ['x+', 'x-', 'y+', 'y-', 'z+', 'z-'])
      .name('cameraViewUp').onChange(function(value){
        this.camera.position.copy(new THREE.Vector3(0, 0, 0));
        this.camera.up = this.cameraViewUpChoices[value][0];
        this.controls.target = this.cameraViewUpChoices[value][1];
        this.gridHelper.lookAt(this.cameraViewUpChoices[value][2]);
        if (value.includes('x')){
          this.gridHelper.rotateX(Math.PI / 2);
        }
      }.bind(this));

    const rayFolder = this.gui.addFolder('Ray');
    rayFolder.add(this.params, 'rayOpacity', 0, 1).step(0.01);

    const cameraPosFolder = this.gui.addFolder('Camera Position');
    cameraPosFolder.add(this.params.cameraPosition, 'x', -100, 100).step(0.01).onChange(value => {
      this.camera.position.x = value;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const lookAtTarget = new THREE.Vector3().copy(this.camera.position).add(forward);
      this.controls.target.copy(lookAtTarget);
      this.controls.update();
    });
    cameraPosFolder.add(this.params.cameraPosition, 'y', -100, 100).step(0.01).onChange(value => {
      this.camera.position.y = value;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const lookAtTarget = new THREE.Vector3().copy(this.camera.position).add(forward);
      this.controls.target.copy(lookAtTarget);
      this.controls.update();
    });
    cameraPosFolder.add(this.params.cameraPosition, 'z', -100, 100).step(0.01).onChange(value => {
      this.camera.position.z = value;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const lookAtTarget = new THREE.Vector3().copy(this.camera.position).add(forward);
      this.controls.target.copy(lookAtTarget);
      this.controls.update();
    });


    const cameraTargetFolder = this.gui.addFolder('Camera Taget');
    cameraTargetFolder.add(this.params.cameraTarget, 'x', -100, 100).step(0.01).onChange(value => {
      const lookAtTarget = new THREE.Vector3(value, this.params.cameraTarget.y, this.params.cameraTarget.z);
      this.controls.target.copy(lookAtTarget);
      this.controls.update();
    });
    cameraTargetFolder.add(this.params.cameraTarget, 'y', -100, 100).step(0.01).onChange(value => {
      const lookAtTarget = new THREE.Vector3(this.params.cameraTarget.x, value, this.params.cameraTarget.z);
      this.controls.target.copy(lookAtTarget);
      this.controls.update();
    });
    cameraTargetFolder.add(this.params.cameraTarget, 'z', -100, 100).step(0.01).onChange(value => {
      const lookAtTarget = new THREE.Vector3(this.params.cameraTarget.x, this.params.cameraTarget.y, value);
      this.controls.target.copy(lookAtTarget);
      this.controls.update();
    });

  // 生成view列表
  if (this.camFrustums !== null && this.camFrustums !== undefined) {
      const viewOptions = this.camFrustums.map((_, idx) => `view${idx}`);

      this.changeView = function (value) {
        const viewIdx = parseInt(value.replace('view', ''));
        this.params.selectedViewIdx = viewIdx;
        this.params.selectedViewName = value;
        this.params.selectedView = value;
        const targetCamera = this.camFrustums[viewIdx].camera;

        if (targetCamera) {
          const camWorldPosition = new THREE.Vector3();
          targetCamera.getWorldPosition(camWorldPosition);

          const camForward = new THREE.Vector3();
          targetCamera.getWorldDirection(camForward);

          const helper = this.camFrustums[viewIdx];
          const moveBackDistance = helper.userData.viewNavigationDistance
            || targetCamera.userData.viewNavigationDistance
            || 1.0;
          const newPosition = camWorldPosition.clone().add(camForward.clone().multiplyScalar(-moveBackDistance));
          const newTarget = camWorldPosition.clone().add(camForward.clone().multiplyScalar(1));

          // --- 关键步骤 ---
          this.camera.up.copy(targetCamera.up);
          this.camera.up.y *= -1; // <<< 手动上下颠倒一下up！！！

          // this.camera.position.copy(newPosition); // 2. 设置位置
          // this.camera.lookAt(newTarget);          // 3. 直接LookAt目标点
          // // 更新控制器（让controls.target同步）
          // this.controls.target.copy(newTarget);
          // this.controls.update();

          // 改用gsap平滑动画飞过去
          gsap.to(this.camera.position, {
            x: newPosition.x,
            y: newPosition.y,
            z: newPosition.z,
            duration: 0.5,
            onUpdate: () => {
                this.camera.lookAt(this.controls.target);
            }
        });

        gsap.to(this.controls.target, {
            x: newTarget.x,
            y: newTarget.y,
            z: newTarget.z,
            duration: 0.5,
            onUpdate: () => {
                this.camera.lookAt(this.controls.target);
                this.controls.update();
            }
        });
        }
      };

      this.gui.add(this.params, 'selectedView', viewOptions)
        .name('Select View')
        .onChange((value) => this.changeView(value));

      this.switchView = function (delta) {
        const numViews = this.camFrustums.length;
        this.params.selectedViewIdx = (this.params.selectedViewIdx + delta + numViews) % numViews;
        this.params.selectedViewName = `view${this.params.selectedViewIdx}`;
        this.changeView(this.params.selectedViewName);
      };
      const viewFolder = this.gui.addFolder('View Navigation');
      viewFolder.add(this.params, 'selectedViewName').name('Current View').listen();
      viewFolder.add({ nextView: () => this.switchView(1) }, 'nextView').name('Next View →');
      viewFolder.add({ prevView: () => this.switchView(-1) }, 'prevView').name('← Previous View');

      this.gui.add(this.params, 'imgOpacity', 0, 1).step(0.01).name('Image Opacity')
      .onChange((value) => {
        this.camImages.forEach(plane => {
          if (plane.material) {
            plane.material.opacity = value;
            plane.material.transparent = true; // 保证透明属性打开
            plane.material.needsUpdate = true; // 有时候需要强制更新
          }
        });
      });
  }

    // this.gui.add(this.params, 'fogDensity')
    //   .min(0).max(1)
    //   .name('Fog');

    if (this.params.hideControlsOnStart) {
      this.gui.close();
    }

    let folder = this.gui.addFolder('Grid Helper');
    folder.open();
    folder.add(this.params, 'showGridHelper')
      .name('show');
    folder.add(this.params.gridHelper, 'size')
      .name('size').onChange(function(value){
        this.initHelpers(true);
      }.bind(this));
    folder.add(this.params.gridHelper, 'unit')
      .name('unit').onChange(function(value){
        this.initHelpers(true);
      }.bind(this));
  }

  initRenderer() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  getCirclePointTexture() {
    if (this.pointCircleTexture !== null) {
      return this.pointCircleTexture;
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, size, size);
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    context.closePath();
    context.fillStyle = '#ffffff';
    context.fill();

    this.pointCircleTexture = new THREE.CanvasTexture(canvas);
    this.pointCircleTexture.needsUpdate = true;
    return this.pointCircleTexture;
  }

  applyPointShape(material) {
    if (!material) {
      return;
    }

    const useCircle = this.params.pointShape === 'circle';
    material.map = useCircle ? this.getCirclePointTexture() : null;
    material.alphaTest = useCircle ? 0.5 : 0.0;
    material.transparent = useCircle;
    material.needsUpdate = true;
  }

  updatePointMaterials() {
    if (this.points !== undefined && this.points !== null) {
      this.applyPointShape(this.points.material);
    }
    if (this.pointsHightlight !== undefined && this.pointsHightlight !== null) {
      this.applyPointShape(this.pointsHightlight.material);
    }
  }

  initScene() {
    //this.scene.fog = new THREE.FogExp2(this.params.backgroundColor, this.params.fogDensity);
    this.scene.background = new THREE.Color(this.params.backgroundColor);
  }

  animate() {
    this.stats.begin();
    requestAnimationFrame(this.animate.bind(this));
    var time = Date.now();
    if (this.lastTime !== time) {
      this.lastTime = time;
      this.updateGui();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.stats.end();
  }

  initCamera() {
    this.points?.geometry.computeBoundingBox();

    let camTarget = this.points ? getBBoxCenter(this.points.geometry) : new THREE.Vector3(0, 0, 0);
    let camPos = this.points ? autoCameraPos(this.points.geometry) : new THREE.Vector3(0, 0, 0);
    const hasOccupancy = this.points !== undefined && this.points !== null &&
      this.points.userData !== undefined && this.points.userData.occGridPositions !== undefined;
    if (hasOccupancy && this.points) {
      const extent = getBBoxMaxExtent(this.points.geometry);
      const targetOffset = new THREE.Vector3(0, 0, -0.5100502512562815 * extent);
      const cameraOffset = new THREE.Vector3(
        -1.256281407035176 * extent,
        1.256281407035176 * extent,
        1.015075376884422 * extent
      );
      camTarget = camTarget.clone().add(targetOffset);
      camPos = camTarget.clone().add(cameraOffset);
    }

    this.camera.position.copy(camPos);
    //this.camera.up = new THREE.Vector3(0, -1, 0);
    this.camera.up = hasOccupancy
      ? new THREE.Vector3(0, 0, 1)
      : this.cameraViewUpChoices[this.params.cameraViewUp][0];
    if (this.controls && this.controls.dispose) {
      this.controls.dispose();
    }
    this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
    this.controls.dynamicDampingFactor = 0.5;
    //this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    //this.controls.rotateSpeed = 0.3;
    //this.controls.zoomSpeed = 1.5;
    this.controls.target.copy(camTarget);
    this.params.cameraPosition.x = camPos.x;
    this.params.cameraPosition.y = camPos.y;
    this.params.cameraPosition.z = camPos.z;
    this.params.cameraTarget.x = camTarget.x;
    this.params.cameraTarget.y = camTarget.y;
    this.params.cameraTarget.z = camTarget.z;
  }

  initLight() {
    const light = new THREE.HemisphereLight(0x888888, 0x333333, 1.0);
    this.scene.add(light);
  }

  initHelpers(refresh=false) {
    // Remove current helpers
    if (this.gridHelper !== null) {
      this.scene.remove(this.gridHelper);
    }

    if (this.axisHelper !== null) {
      this.scene.remove(this.axisHelper);
    }

    // BBox center
    // var center = getBBoxCenter(this.points.geometry);
    // var extent = getBBoxMaxExtent(this.points.geometry);

    // Grid helper
    if (this.gridHelper === null || refresh) {
      const size = this.params.gridHelper.size;
      const unit = this.params.gridHelper.unit;
      const divisions = size / unit;
      this.gridHelper = new THREE.GridHelper(size, divisions);
      this.gridHelper.lookAt(this.cameraViewUpChoices[this.params.cameraViewUp][2]);
      this.gridHelper.name = 'gridHelper';
    }

    // Axis helper
    if (this.axisHelper === null || refresh) {
      //console.log(extent);
      this.axisHelper = new THREE.AxisHelper();
      this.axisHelper.material.linewidth = 10;
      this.axisHelper.name = 'axisHelper';
    }

    // Display
    if (this.params.showGridHelper) {
      this.scene.add(this.gridHelper);
      //this.scene.add(this.axisHelper);
    }
    if (this.params.showAxesHelper) {
      //this.scene.add(this.gridHelper);
      this.scene.add(this.axisHelper);
    }
  }

  updateGui() {
    
    // Points
    if (this.points !== undefined && this.points !== null) {
      this.points.visible = this.params.showPoints;
      if (this.params.showPoints) {
        this.points.material.size = this.params.pointSize;
      }
      if (this.pointsHightlight !== null){
        this.pointsHightlight.visible = this.params.showPoints;
        this.pointsHightlight.material.size = this.points.material.size * 6;
      }
    }

    this.scene.traverse((object) => {
      if (object instanceof THREE.CameraHelper) {
        const camera = object.camera; // 获取关联的相机
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.near = 0.1 * this.params.camSize;
            camera.far = 0.2 * this.params.camSize;
            camera.updateProjectionMatrix();
            object.update();
        }
          // object.geometry.scale(this.params.camSize, this.params.camSize, this.params.camSize);
          // object.update();
      }
    });

    this.scene.traverse((object) => {
      if (object instanceof THREE.LineSegments) {
        object.material.opacity = this.params.rayOpacity;
      }
    });
    
    if (this.monochrome) {
      this.points.material.color = new THREE.Color(this.params.pointColor);
    }

    // Mesh
    if (this.mesh !== undefined && this.mesh !== null) {
      this.scene.remove(this.mesh);
      if (this.params.showMesh) {
        this.scene.add(this.mesh);
      }
      if (!this.occHasScalars && this.mesh.material && this.mesh.material.color) {
        this.mesh.material.color = new THREE.Color(this.params.pointColor);
      }
  }

    // Wireframe
    if (this.wireframe !== undefined && this.wireframe !== null) {
      this.scene.remove(this.wireframe);
      if (this.params.showWireframe) {
        this.scene.add(this.wireframe);
      }
      this.wireframe.material.color = new THREE.Color(this.params.wireframeColor);
      this.wireframe.material.wireframeLinewidth = this.params.wireframeWidth;
  }
    this.initScene();
    this.initHelpers();
  }

  prepareOccupancy(occupancy) {
    const scalars = occupancy.scalars === null
      ? null
      : Int32Array.from(occupancy.scalars, value => Math.round(value));
    return {
      count: occupancy.count,
      rawPositions: occupancy.positions,
      displayPositions: this.getOccupancyDisplayPositions(occupancy.positions),
      scalars: scalars,
    };
  }

  getOccupancyDisplayPositions(rawPositions) {
    const displayPositions = rawPositions.slice();
    if (!this.params.occCenterXY || rawPositions.length === 0) {
      return displayPositions;
    }

    let sumX = 0;
    let sumY = 0;
    const count = rawPositions.length / 3;
    for (let i = 0; i < rawPositions.length; i += 3) {
      sumX += rawPositions[i];
      sumY += rawPositions[i + 1];
    }

    const centerX = Math.trunc(sumX / count);
    const centerY = Math.trunc(sumY / count);
    for (let i = 0; i < displayPositions.length; i += 3) {
      displayPositions[i] -= centerX;
      displayPositions[i + 1] -= centerY;
    }

    return displayPositions;
  }

  getOccupancyCubeSize() {
    return this.params.occVoxelSize;
  }

  applyOccupancyDisplayState(resetCamera = false) {
    if (this.occupancy === null) {
      return;
    }

    this.occupancy.displayPositions = this.getOccupancyDisplayPositions(this.occupancy.rawPositions);
    if (this.points !== undefined && this.points !== null) {
      this.points.userData.occGridPositions = this.occupancy.displayPositions;
      this.updateOccupancyPointPositions();
    }

    if (this.mesh !== undefined && this.mesh !== null && this.mesh.userData !== undefined) {
      this.mesh.userData.occGridPositions = this.occupancy.displayPositions;
    }
    this.updateOccupancyScale();

    if (resetCamera) {
      this.initCamera();
      this.initHelpers(true);
    }
  }

  updateOccupancyScale() {
    if (this.mesh === undefined || this.mesh === null || this.occupancy === null) {
      return;
    }

    const cubeSize = this.getOccupancyCubeSize();

    if (this.mesh.isInstancedMesh && this.mesh.userData.occGridPositions !== undefined) {
      this.updateOccupancyMeshInstanceMatrices(this.mesh, this.occupancy.displayPositions, cubeSize);
    } else if (this.mesh.userData !== undefined && this.mesh.userData.occUniforms !== undefined) {
      const offsets = this.mesh.userData.occOffsetAttribute;
      if (offsets !== undefined) {
        const values = offsets.array;
        values.set(this.occupancy.displayPositions);
        offsets.needsUpdate = true;
        this.mesh.geometry.computeBoundingBox();
        this.mesh.geometry.computeBoundingSphere();
      }
      this.mesh.userData.occUniforms.uVoxelSize.value = cubeSize;
    } else if (this.mesh.userData !== undefined && this.mesh.userData.occBatches !== undefined) {
      this.mesh.userData.occBatches.forEach(batch => {
        this.updateOccupancyMeshInstanceMatrices(batch.mesh, this.occupancy.displayPositions, cubeSize, batch.indices);
      });
    }

    this.updateOccupancyPointPositions();
  }

  updateOccupancyMeshInstanceMatrices(mesh, positions, cubeSize, indices = null) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(cubeSize, cubeSize, cubeSize);

    for (let i = 0; i < mesh.count; i++) {
      const sourceIndex = indices === null ? i : indices[i];
      const offset = sourceIndex * 3;
      position.set(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2]
      );
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }

  updateOccupancyPointPositions() {
    if (this.points === undefined || this.points === null || this.occupancy === null) {
      return;
    }

    const gridPositions = this.occupancy.displayPositions;
    const positionAttr = this.points.geometry.getAttribute('position');
    const worldPositions = positionAttr.array;

    for (let i = 0; i < gridPositions.length; i += 3) {
      worldPositions[i] = gridPositions[i];
      worldPositions[i + 1] = gridPositions[i + 1];
      worldPositions[i + 2] = gridPositions[i + 2];
    }

    positionAttr.needsUpdate = true;
    this.points.geometry.computeBoundingBox();
    this.points.geometry.computeBoundingSphere();
  }

  updateOccupancyLabelVisibility(label, visible) {
    if (this.mesh === undefined || this.mesh === null || this.mesh.userData === undefined) {
      return;
    }
    if (this.mesh.userData.occLabelStates === undefined) {
      this.mesh.userData.occLabelStates = {};
    }
    this.mesh.userData.occLabelStates[label] = visible;

    if (this.mesh.userData.occVisibilityAttribute !== undefined && this.mesh.userData.occScalars !== undefined) {
      const visibility = this.mesh.userData.occVisibilityAttribute.array;
      const scalars = this.mesh.userData.occScalars;
      for (let i = 0; i < scalars.length; i++) {
        if (scalars[i] === label) {
          visibility[i] = visible ? 1.0 : 0.0;
        }
      }
      this.mesh.userData.occVisibilityAttribute.needsUpdate = true;
    } else if (this.mesh.userData.occBatches !== undefined) {
      this.mesh.userData.occBatches.forEach(batch => {
        if (batch.scalar === label) {
          batch.mesh.visible = visible;
        }
      });
    }
  }

  getOccupancyLutColor(index) {
    const lut = {
      0: [255, 255, 255],
      1: [112, 128, 144],
      2: [220, 20, 60],
      3: [255, 127, 80],
      4: [255, 158, 0],
      5: [233, 150, 70],
      6: [255, 61, 99],
      7: [0, 0, 230],
      8: [47, 79, 79],
      9: [255, 140, 0],
      10: [255, 99, 71],
      11: [0, 207, 191],
      12: [175, 0, 75],
      13: [75, 0, 75],
      14: [112, 180, 60],
      15: [222, 184, 135],
      16: [0, 175, 0],
    };
    const rgb = lut[index];
    if (!rgb) {
      return this.getGeneratedOccupancyColor(index);
    }
    return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  }

  getGeneratedOccupancyColor(index) {
    const color = new THREE.Color();
    const hue = ((Math.abs(Math.round(index)) + 1) * 137.508) % 360 / 360;
    color.setHSL(hue, 0.75, 0.6);
    return color;
  }

  getOccupancyScalarColor(value) {
    return this.getOccupancyLutColor(Math.round(value) + 1);
  }

  createOccupancyPointColors(scalars) {
    const colors = new Float32Array(scalars.length * 3);
    for (let i = 0; i < scalars.length; i++) {
      const offset = i * 3;
      const color = this.getOccupancyScalarColor(scalars[i]);
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    return colors;
  }

  createOccupancyScalarMesh(occupancy) {
    const baseGeometry = new THREE.BoxBufferGeometry(1, 1, 1);
    const geometry = new THREE.InstancedBufferGeometry().copy(baseGeometry);
    const offsets = new Float32Array(occupancy.count * 3);
    const colors = new Float32Array(occupancy.count * 3);
    const visibility = new Float32Array(occupancy.count);
    const scalarCounts = new Map();

    for (let i = 0; i < occupancy.count; i++) {
      const srcOffset = i * 3;
      offsets[srcOffset] = occupancy.displayPositions[srcOffset];
      offsets[srcOffset + 1] = occupancy.displayPositions[srcOffset + 1];
      offsets[srcOffset + 2] = occupancy.displayPositions[srcOffset + 2];

      const scalar = Math.round(occupancy.scalars[i]);
      const color = this.getOccupancyScalarColor(scalar);
      colors[srcOffset] = color.r;
      colors[srcOffset + 1] = color.g;
      colors[srcOffset + 2] = color.b;
      visibility[i] = 1.0;
      scalarCounts.set(scalar, (scalarCounts.get(scalar) || 0) + 1);
    }

    geometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.setAttribute('instanceVisible', new THREE.InstancedBufferAttribute(visibility, 1));
    geometry.maxInstancedCount = occupancy.count;

    const uniforms = {
      uVoxelSize: { value: this.getOccupancyCubeSize() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: `
        attribute vec3 instanceOffset;
        attribute vec3 instanceColor;
        attribute float instanceVisible;
        uniform float uVoxelSize;
        varying vec3 vColor;
        varying float vVisible;
        varying vec3 vViewNormal;

        void main() {
          vColor = instanceColor;
          vVisible = instanceVisible;
          vViewNormal = normalize(normalMatrix * normal);
          vec3 transformed = position * uVoxelSize + instanceOffset;
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vVisible;
        varying vec3 vViewNormal;

        void main() {
          if (vVisible < 0.5) {
            discard;
          }
          vec3 normal = normalize(vViewNormal);
          vec3 keyLight = normalize(vec3(0.45, 0.7, 1.0));
          vec3 fillLight = normalize(vec3(-0.35, -0.2, 0.75));
          float diffuse = max(dot(normal, keyLight), 0.0);
          float fill = max(dot(normal, fillLight), 0.0);
          float shading = 0.52 + 0.33 * diffuse + 0.15 * fill;
          gl_FragColor = vec4(vColor * shading, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.userData.occUniforms = uniforms;
    mesh.userData.occGridPositions = occupancy.displayPositions;
    mesh.userData.occOffsetAttribute = geometry.getAttribute('instanceOffset');
    mesh.userData.occScalars = Array.from(occupancy.scalars, value => Math.round(value));
    mesh.userData.occVisibilityAttribute = geometry.getAttribute('instanceVisible');
    mesh.userData.occLabelStates = {};
    mesh.userData.occLabelEntries = Array.from(scalarCounts.entries()).map(([scalar, count]) => ({
      scalar: scalar,
      count: count,
    }));
    return mesh;
  }

  createOccupancyMesh(occupancy) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    if (occupancy.scalars === null) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.params.pointColor),
        roughness: 0.2,
        metalness: 0.0,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, occupancy.count);
      this.updateOccupancyMeshInstanceMatrices(mesh, occupancy.displayPositions, this.getOccupancyCubeSize());
      mesh.frustumCulled = false;
      mesh.userData.occGridPositions = occupancy.displayPositions;
      return mesh;
    }
    return this.createOccupancyScalarMesh(occupancy);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  addMesh(fileToLoad) {
    const self = this;
    const base = basename(fileToLoad);
    const ext = extname(fileToLoad);
    var loaderParams = {};
    if (ext === 'bin'){
      loaderParams.ptFeats = self.params.ptFeats;
    }
    if (ext === 'npy') {
      loaderParams.npyVisualizationType = self.params.npyVisualizationType || 'occupancy';
    }
    const loader = createModelLoader(fileToLoad, loaderParams);

    loader.load(fileToLoad, function (object) {
      var geometry;
      var geometryHighlight = null;
      var boxMeshes = null;
      var occupancy = null;
      if (object.isGeometry || object.isBufferGeometry) {
        geometry = object;
      } else if (object.isGroup) {
        // merge geometries
        console.log(object);
        geometry = THREE.BufferGeometryUtils.mergeBufferGeometries(
          object.children.map(child =>
            child.geometry.clone().applyMatrix4(child.matrix))
        );

        // Add indices if not exist
        console.log(object.children[0].isPoints);
        if (geometry.index === null && !object.children[0].isPoints) {
          var nVerts = geometry.getAttribute('position').length / 3;
          var indices = Array.from(Array(nVerts), (v, k) => k);
          geometry.setIndex(indices);
        }
      } else if (Object.prototype.toString.call(object) === '[object Object]'){
        geometry = object.geometry;
        boxMeshes = object.boxMeshes;
        occupancy = object.occupancy;
        //geometryHighlight = object.geometryHighlight;
        if ('camFrustums' in object){
          self.camFrustums = object.camFrustums;
          object.camFrustums.forEach(element => {
            self.scene.add(element);
          });
        }
        if ('camImages' in object){
          self.camImages = object.camImages;
          object.camImages.forEach(element => {
            self.scene.add(element);
          });
        }
        if (('lineSegments' in object) && (object.lineSegments !== null)) {
          self.scene.add(object.lineSegments);
        }
      }
      else {
        // expect object is THREE.Mesh
        geometry = object.geometry;
      }

      console.log(geometry);
      if (geometry !== undefined && geometry !== null) {
        if (occupancy !== null) {
          occupancy = self.prepareOccupancy(occupancy);
          self.occupancy = occupancy;
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(occupancy.displayPositions.slice(), 3));
          if (occupancy.scalars !== null) {
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(self.createOccupancyPointColors(occupancy.scalars), 3));
          }
        } else {
          self.occupancy = null;
        }
    
	      // mesh support
	      const meshSupport = occupancy !== null || geometry.index !== null;
	      this.params.showMesh = meshSupport;
	      this.params.showPoints = !meshSupport;
	      if (occupancy !== null && typeof this.params.backgroundColor === 'string' && this.params.backgroundColor.toLowerCase() === '#121212') {
	        this.params.backgroundColor = '#ffffff';
	        this.initScene();
	      }

	      // add points
      //const sprite = new THREE.TextureLoader().load('three/textures/sprites/disc.png');
      var pointsMaterial = new THREE.PointsMaterial({
        size: 35,
        sizeAttenuation: true,
        alphaTest: 0.0,
        transparent: false
      });
      self.points = new THREE.Points(geometry, pointsMaterial);
      self.points.name = base + '_points';
      self.applyPointShape(pointsMaterial);
      if (occupancy !== null) {
        self.points.userData.occGridPositions = occupancy.displayPositions;
        self.updateOccupancyPointPositions();
      }

      try {
        const colorAttr = geometry.getAttribute('color');
        if (colorAttr && colorAttr.count > 0) {
          pointsMaterial.vertexColors = true;
        }
      } catch (e) {
        console.error(e);
        self.monochrome = true;
      }
      self.scene.add(self.points);
      if (boxMeshes !== null && boxMeshes !== undefined) {
        self.boxMeshes = boxMeshes;
        boxMeshes.forEach(element => {
          self.scene.add(element);
        });
      }
      }
      
      if (geometryHighlight !== null && geometryHighlight !== undefined){
        var pointsMaterialHighlight = new THREE.PointsMaterial({
          size: 100,
          sizeAttenuation: true,
          alphaTest: 0.0,
          transparent: false
        });
        self.pointsHightlight = new THREE.Points(geometryHighlight, pointsMaterialHighlight);
        self.pointsHightlight.name = base + '_points_hightlight';
        self.applyPointShape(pointsMaterialHighlight);
  
        try {
          const colorAttr = geometryHighlight.getAttribute('color');
          if (colorAttr && colorAttr.count > 0) {
            pointsMaterialHighlight.vertexColors = true;
          }
        } catch (e) {
          console.error(e);
          self.monochrome = true;
        }
        self.scene.add(self.pointsHightlight);
      } else {
        self.pointsHightlight = null;
      }
      
      // add mesh
      try {
        if (occupancy !== null) {
          self.occHasScalars = occupancy.scalars !== null;
          self.mesh = self.createOccupancyMesh(occupancy);
          self.mesh.name = base + '_occupancy';
          self.scene.add(self.mesh);
          self.wireframe = null;
        } else {
          self.occHasScalars = false;
          geometry.computeVertexNormals();

          var material = new THREE.MeshStandardMaterial({
            color: 0xefefef,
            roughness: 0.1,
            flatShading: true,
            side: THREE.DoubleSide
          });
          self.mesh = new THREE.Mesh(geometry, material);
          self.mesh.castShadow = true;
          self.mesh.receiveShadow = true;
          self.mesh.name = base + '_mesh';
          self.scene.add(self.mesh);

          var wiremat = new THREE.MeshStandardMaterial({
            color: self.params.wireframeColor,
            roughness: 0.1,
            flatShading: true,
            side: THREE.DoubleSide,
            wireframe: true,
            wireframeLinewidth: self.params.wireframeWidth
          });
          self.wireframe = new THREE.Mesh(geometry, wiremat);
          self.wireframe.name = base + '_wireframe';
          self.scene.add(self.wireframe);
        }
      } catch (e) { console.error(e); }

      self.initCamera();
      self.initGui();
      self.initHelpers();
      self.animate();
    }.bind(self));
  }
}

viewer = new Viewer();
