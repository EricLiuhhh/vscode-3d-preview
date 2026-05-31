( function () {

	class CAMPOSELoader extends THREE.Loader {
		constructor(manager=undefined){
			super(manager);
		}
		load( url, onLoad, onProgress, onError ) {
			const scope = this;
			const loader = new THREE.FileLoader( this.manager );
			loader.setPath( this.path );
			//loader.setResponseType( 'arraybuffer' );
			loader.load( url, function ( text ) {

				try {

					onLoad( scope.parse( text ) );

				} catch ( e ) {

					if ( onError ) {

						onError( e );

					} else {

						console.error( e );

					}

					scope.manager.itemError( url );

				}

			}, onProgress, onError );

		}

		parse( data ) {
            const parsedData = JSON.parse(data); // 解析JSON数据
            //const intrinsics = parsedData.intrinsics;  // 获取内参矩阵
            const extrinsics = parsedData.extrinsics;  // 获取外参矩阵
			const origins = parsedData.origins;
			const dirs = parsedData.dirs;
			
			var geometry = null;
			if ("points" in parsedData) {
				const points = parsedData.points;
				const vertices = new Float32Array(points.flat());
				// get points
				geometry = new THREE.BufferGeometry();
				geometry.setAttribute(
					"position",
					new THREE.Float32BufferAttribute(vertices, 3)
				);
				if ("colors" in parsedData) {
					const colors = new Float32Array(parsedData.colors.flat());
					geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
				}
			}

            // 可视化每个相机的外参
            var camFrustums = [];
			var camImages = [];
            extrinsics.forEach((matrixArray, index) => {
                const extrinsicMatrix = new THREE.Matrix4().fromArray(matrixArray.flat());
                extrinsicMatrix.copy(extrinsicMatrix.transpose());
                const perspectiveCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 0.5);
                //perspectiveCamera.matrixWorld.copy(extrinsicMatrix);
                const translation = new THREE.Vector3();
                const quaternion = new THREE.Quaternion();
                translation.setFromMatrixPosition(extrinsicMatrix);
                perspectiveCamera.position.set(translation.x, translation.y, translation.z);

                const flipZMatrix = new THREE.Matrix4();
                flipZMatrix.makeRotationY(Math.PI);
                extrinsicMatrix.multiply(flipZMatrix);
                quaternion.setFromRotationMatrix(extrinsicMatrix);
                perspectiveCamera.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                perspectiveCamera.updateMatrixWorld();
                // 设置相机位置和旋转
                const cameraHelper = new THREE.CameraHelper(perspectiveCamera);
                const baseViewDistance = Math.max((perspectiveCamera.far - perspectiveCamera.near) * 2.0, 0.5);
                perspectiveCamera.userData.viewNavigationDistance = baseViewDistance;
                cameraHelper.userData.viewNavigationDistance = baseViewDistance;
                camFrustums.push(cameraHelper);


				// --- 这里开始是新增部分：处理图像 ---
				if (parsedData.images && parsedData.images[index]) {
					const texture = new THREE.TextureLoader().load(parsedData.images[index]);
					texture.flipY = false;
					// 创建Plane
					const planeGeometry = new THREE.PlaneGeometry(1, 1);
					const planeMaterial = new THREE.MeshBasicMaterial({
						map: texture,
						side: THREE.DoubleSide,
						transparent: true,   // <<< 开启透明
						opacity: 1.0     // <<< 使用传入的透明度
					});
					const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);

					// 把Plane放到near plane上
					const nearCenter = new THREE.Vector3();
					perspectiveCamera.getWorldDirection(nearCenter);
					nearCenter.multiplyScalar(perspectiveCamera.near).add(perspectiveCamera.position);
					planeMesh.position.copy(nearCenter);

					// 旋转plane朝向
					const quat = new THREE.Quaternion();
					quat.setFromRotationMatrix(
						new THREE.Matrix4().lookAt(nearCenter, perspectiveCamera.position, perspectiveCamera.up)
					);
					planeMesh.quaternion.copy(quat);

					// 尺寸根据相机near plane
					const height = 2 * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)) * perspectiveCamera.near;
					const width = height * perspectiveCamera.aspect;
					planeMesh.scale.set(width, height, 1);

					camImages.push(planeMesh);
				}

            });

			var lineSegments = null;
			if ((origins !== undefined) && (dirs !== undefined)){
				const rayLength = 100;
				const positions = [];

				// 批量填充所有射线的两个端点
				for (let i = 0; i < origins.length; i++) {
					const origin = new THREE.Vector3(...origins[i]);
					const dir = new THREE.Vector3(...dirs[i]);
					const end = origin.clone().add(dir.multiplyScalar(rayLength));

					positions.push(origin.x, origin.y, origin.z);
					positions.push(end.x, end.y, end.z);
				}

				// 创建几何体
				const rayGeometry = new THREE.BufferGeometry();
				rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

				// 统一材质
				const rayMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1.0 });

				// 使用 LineSegments 统一绘制所有射线
				lineSegments = new THREE.LineSegments(rayGeometry, rayMaterial);
			}

			return {geometry: geometry, camFrustums: camFrustums, camImages: camImages, lineSegments: lineSegments};

		}

	}

	THREE.CAMPOSELoader = CAMPOSELoader;

} )();
