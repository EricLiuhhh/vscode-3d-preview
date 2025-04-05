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
                camFrustums.push(cameraHelper);
            });
			return {geometry: geometry, camFrustums: camFrustums};

		}

	}

	THREE.CAMPOSELoader = CAMPOSELoader;

} )();